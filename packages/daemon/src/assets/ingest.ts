import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve, sep } from 'node:path';
import { AppError, type AssetMeta, type GltfReport } from '@vibebyte/vibe3d-protocol';
import type { AssetPolicy, DispatchContext, IngestResult } from '../context';
import type { BlobStore } from './blobstore';
import { parseGltf } from './gltf-parse';
import type { ImageInfo } from './image-meta';
import { MAX_HDRI_BYTES, classifyUpload } from './upload';

export interface IngestDeps {
  blobs: BlobStore;
  fetchImpl?: typeof fetch;
  roots?: string[];
}

export interface IngestOptions {
  maxBytes?: number;
  hdri?: boolean;
}

interface Loaded {
  bytes: Buffer;
  name: string;
  mime: string;
  kind: 'gltf' | 'image';
  image?: ImageInfo;
}

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

function settle(bytes: Buffer, name: string, mime?: string | null, opts: IngestOptions = {}): Loaded {
  const info = classifyUpload({
    filename: name,
    mime: mime ?? undefined,
    bytes,
    maxBytes: opts.maxBytes,
    hdri: opts.hdri,
  });
  return { bytes, name, mime: info.mime, kind: info.kind, image: info.image };
}

function isLoopback(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
}

function contains(root: string, path: string): boolean {
  const base = root.endsWith(sep) ? root : `${root}${sep}`;
  return path === root || path.startsWith(base);
}

async function localPath(src: string, roots: string[], policy: AssetPolicy): Promise<string> {
  let real: string;
  try {
    real = await realpath(resolve(src));
  } catch {
    throw new AppError('E_ASSET_MISSING', `文件不存在或不可读：${src}`);
  }
  if (policy === 'allow') return real;
  for (const root of roots) {
    let base: string;
    try {
      base = await realpath(resolve(root));
    } catch {
      base = resolve(root);
    }
    if (contains(base, real)) return real;
  }
  throw new AppError('E_UNSUPPORTED', `本地路径不在允许的资产根目录内：${src}`, {
    roots: [...new Set(roots.map((root) => resolve(root)))],
    resolved: real,
    hint: '本次调用显式传 policy:"allow" 即可放行；长期放行把资产放进资产根，或用 --asset-root <dir> / VIBE3D_ASSET_ROOTS 扩大范围',
    next: {
      tool: 'vibe3d_put_asset',
      params: { src, policy: 'allow' },
      after: 'vibe3d_import_asset{sha}',
    },
  });
}

async function readCapped(res: Response, src: string, maxBytes: number): Promise<Buffer> {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过上限：${src}`, { bytes: buf.length });
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过上限：${src}`, { bytes: total });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function download(
  src: string,
  policy: AssetPolicy,
  fetchImpl: typeof fetch,
  maxBytes: number,
): Promise<{ bytes: Buffer; name: string; mime: string | null }> {
  let url = new URL(src);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (policy === 'local' && !isLoopback(url)) {
      throw new AppError('E_UNSUPPORTED', `policy=local 只允许本机地址，拒绝 ${url.host}`, {
        hint: '远端资产请先 put_asset{policy:"allow"} 预注册，或显式传 policy:"allow"',
        next: {
          tool: 'vibe3d_put_asset',
          params: { src, policy: 'allow' },
          after: 'vibe3d_import_asset{sha}',
        },
      });
    }
    const res = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new AppError('E_ASSET_MISSING', `重定向缺少 Location：${url.href}`);
      if (hop === MAX_REDIRECTS) {
        throw new AppError('E_UNSUPPORTED', `重定向次数超过 ${MAX_REDIRECTS} 次：${src}`);
      }
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new AppError('E_ASSET_MISSING', `下载失败 ${res.status}：${src}`);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过上限：${src}`, { bytes: length });
    }
    const bytes = await readCapped(res, src, maxBytes);
    const raw = basename(url.pathname);
    let name = raw || 'remote.glb';
    try {
      name = decodeURIComponent(raw) || 'remote.glb';
    } catch {
      name = raw || 'remote.glb';
    }
    return { bytes, name, mime: res.headers.get('content-type') };
  }
  throw new AppError('E_UNSUPPORTED', `无法解析地址：${src}`);
}

export function createIngest({
  blobs,
  fetchImpl = fetch,
  roots = [process.cwd(), tmpdir()],
}: IngestDeps): Pick<DispatchContext, 'ingest' | 'inspect'> {
  const read = async (src: string, policy: AssetPolicy = 'local', maxBytes = MAX_HDRI_BYTES) => {
    if (/^https?:\/\//i.test(src)) {
      if (policy === 'strict') {
        throw new AppError('E_UNSUPPORTED', 'policy=strict 不允许网络地址，请先下载到本地', {
          hint: 'strict 下外链须先预注册：用 put_asset（policy:"allow"）落成 sha，再 node.import{sha}',
          next: {
            tool: 'vibe3d_put_asset',
            params: { src, policy: 'allow' },
            after: 'vibe3d_import_asset{sha}',
          },
        });
      }
      return download(src, policy, fetchImpl, maxBytes);
    }
    const path = await localPath(src, roots, policy);
    const bytes = await readFile(path);
    if (bytes.length > maxBytes) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', `资产超过上限：${src}`, {
        bytes: bytes.length,
        limit: maxBytes,
      });
    }
    return { bytes, name: basename(path), mime: null as string | null };
  };

  const load = async (
    src: string,
    policy: AssetPolicy = 'local',
    opts: IngestOptions = {},
  ): Promise<Loaded> => {
    const loaded = await read(src, policy, opts.maxBytes ?? MAX_HDRI_BYTES);
    return settle(loaded.bytes, loaded.name, loaded.mime, opts);
  };

  const inspect = async (src: string, policy: AssetPolicy = 'local') => {
    const loaded = await load(src, policy);
    if (loaded.kind !== 'gltf') {
      throw new AppError('E_ASSET_TYPE', `asset.inspect 只支持 glTF：${loaded.name}`);
    }
    const report = parseGltf(loaded.bytes, loaded.name);
    const sha = createHash('sha256').update(loaded.bytes).digest('hex');
    return { sha, cached: existsSync(blobs.path(sha)), report };
  };

  const makeMeta = (sha: string, loaded: Loaded, report?: GltfReport): AssetMeta => ({
    sha,
    bytes: loaded.bytes.length,
    name: loaded.name.slice(0, 300),
    mime: loaded.mime,
    kind: loaded.kind,
    ...(report ? { gltf: report } : {}),
    ...(loaded.image ? { image: loaded.image } : {}),
  });

  const ingest = async (
    src: string,
    policy: AssetPolicy = 'local',
    opts: IngestOptions = {},
  ): Promise<IngestResult> => {
    const loaded = await load(src, policy, opts);
    const report = loaded.kind === 'gltf' ? parseGltf(loaded.bytes, loaded.name) : undefined;
    const sha = createHash('sha256').update(loaded.bytes).digest('hex');
    const cached = existsSync(blobs.path(sha));
    if (!cached) await blobs.put(loaded.bytes);
    return { meta: makeMeta(sha, loaded, report), report, cached };
  };

  return { ingest, inspect };
}
