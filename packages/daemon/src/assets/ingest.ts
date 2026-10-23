import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { AppError, type AssetMeta, type GltfReport } from '@vibebyte/vibe3d-protocol';
import type { AssetPolicy, DispatchContext, IngestResult } from '../context';
import type { BlobStore } from './blobstore';
import { parseGltf } from './gltf-parse';
import { classifyUpload } from './upload';

export interface IngestDeps {
  blobs: BlobStore;
  fetchImpl?: typeof fetch;
}

interface Loaded {
  bytes: Buffer;
  name: string;
  mime: string;
}

function settle(bytes: Buffer, name: string, mime?: string | null): Loaded {
  const info = classifyUpload({ filename: name, mime: mime ?? undefined, bytes });
  return { bytes, name, mime: info.mime };
}

function isLoopback(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
}

export function createIngest({
  blobs,
  fetchImpl = fetch,
}: IngestDeps): Pick<DispatchContext, 'ingest' | 'inspect'> {
  const read = async (src: string, policy: AssetPolicy = 'local') => {
    if (/^https?:\/\//i.test(src)) {
      if (policy === 'strict') {
        throw new AppError('E_UNSUPPORTED', 'policy=strict 不允许网络地址，请先下载到本地');
      }
      const url = new URL(src);
      if (policy === 'local' && !isLoopback(url)) {
        throw new AppError('E_UNSUPPORTED', `policy=local 只允许本机地址，拒绝 ${url.host}`);
      }
      const res = await fetchImpl(url, { redirect: 'follow' });
      if (!res.ok) throw new AppError('E_ASSET_MISSING', `下载失败 ${res.status}：${src}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      return {
        bytes,
        name: basename(url.pathname) || 'remote.glb',
        mime: res.headers.get('content-type'),
      };
    }
    try {
      const bytes = await readFile(src);
      return { bytes, name: basename(src), mime: undefined };
    } catch {
      throw new AppError('E_ASSET_MISSING', `文件不存在或不可读：${src}`);
    }
  };
  const load = async (src: string, policy: AssetPolicy = 'local'): Promise<Loaded> => {
    const loaded = await read(src, policy);
    return settle(loaded.bytes, loaded.name, loaded.mime);
  };

  const inspect = async (src: string, policy: AssetPolicy = 'local') => {
    const { bytes, name } = await load(src, policy);
    const report = parseGltf(bytes, name);
    return { sha: createHash('sha256').update(bytes).digest('hex'), report };
  };

  const makeMeta = (sha: string, loaded: Loaded, report: GltfReport): AssetMeta => ({
    sha,
    bytes: loaded.bytes.length,
    name: loaded.name.slice(0, 300),
    mime: loaded.mime,
    kind: 'gltf',
    gltf: report,
  });

  const ingest = async (src: string, policy: AssetPolicy = 'local'): Promise<IngestResult> => {
    const loaded = await load(src, policy);
    const report = parseGltf(loaded.bytes, loaded.name);
    const sha = createHash('sha256').update(loaded.bytes).digest('hex');
    const cached = existsSync(blobs.path(sha));
    if (!cached) await blobs.put(loaded.bytes);
    return { meta: makeMeta(sha, loaded, report), report, cached };
  };

  return { ingest, inspect };
}
