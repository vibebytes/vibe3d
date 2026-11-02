import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { imagePayloads } from '@vibebyte/vibe3d-capabilities';
import { type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';
import type { ParsedArgs } from './args';

type FetchImpl = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parentAt(root: unknown, path: (string | number)[]): Record<string, unknown> {
  let cursor: unknown = root;
  for (const key of path) cursor = (cursor as Record<string | number, unknown>)[key];
  return cursor as Record<string, unknown>;
}

function extOf(mime: string): string {
  return mime === 'image/jpeg' ? 'jpg' : 'png';
}

/** 把结果里的图片写到 --out。单张写文件，多张按 view/label 写目录。没有图片却给了 --out 则报错。 */
export async function writeImages(result: unknown, out: string | undefined): Promise<unknown> {
  const payloads = imagePayloads(result);
  if (!out) return result;
  if (payloads.length === 0) throw new Vibe3DError('E_INVALID_PARAMS', '--out 需要结果里有图片');
  const clone = structuredClone(result);
  if (payloads.length === 1) {
    const payload = payloads[0]!;
    const bytes = Buffer.from(payload.base64, 'base64');
    await writeFile(out, bytes);
    const record = parentAt(clone, payload.path);
    const { base64: _bytes, ...rest } = record;
    const next = { ...rest, path: out, bytes: bytes.length };
    if (payload.path.length === 0) return next;
    let cursor = clone as Record<string | number, unknown>;
    for (const key of payload.path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>;
    cursor[payload.path.at(-1) ?? 0] = next;
    return clone;
  }
  await mkdir(out, { recursive: true });
  for (const [index, payload] of payloads.entries()) {
    const name = `${payload.label ?? index}.${extOf(payload.mime)}`;
    const path = join(out, name);
    const bytes = Buffer.from(payload.base64, 'base64');
    await writeFile(path, bytes);
    const record = parentAt(clone, payload.path);
    const { base64: _bytes, ...rest } = record;
    let cursor = clone as Record<string | number, unknown>;
    for (const key of payload.path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>;
    cursor[payload.path.at(-1) ?? 0] = { ...rest, path };
  }
  return clone;
}

async function download(url: string, base: string, fetchImpl: FetchImpl): Promise<Buffer> {
  const target = new URL(url, base);
  const res = await fetchImpl(target);
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status} ${target}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 任务类结果默认等待完成。--no-wait 返回快照；--out 下载文件或帧目录。 */
export async function settleJob(
  studio: Studio,
  result: unknown,
  kind: 'file' | 'frames' | undefined,
  flags: ParsedArgs['flags'],
  fetchImpl: FetchImpl = fetch,
  pollMs?: number,
): Promise<unknown> {
  if (!kind || !isRecord(result) || typeof result.jobId !== 'string') return result;
  if (flags.wait === false) return result;
  const timeout = typeof flags.timeout === 'string' ? Number(flags.timeout) : undefined;
  const job = await studio.job(result.jobId).wait({
    timeoutMs: timeout ? timeout * 1000 : undefined,
    ...(pollMs === undefined ? {} : { pollMs }),
  });
  const out = typeof flags.out === 'string' ? flags.out : undefined;
  if (!out || !job.url) return job;
  if (kind === 'file') {
    const bytes = await download(job.url, studio.url, fetchImpl);
    await writeFile(out, bytes);
    return { path: out, bytes: bytes.length, jobId: job.jobId, url: job.url, revision: job.revision };
  }
  const manifestBytes = await download(job.url, studio.url, fetchImpl);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'manifest.json'), manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    frames?: { url?: string; file?: string }[];
  };
  const files = [];
  for (const frame of manifest.frames ?? []) {
    if (!frame.url) continue;
    const bytes = await download(frame.url, studio.url, fetchImpl);
    const name = frame.file ? basename(frame.file) : basename(new URL(frame.url, studio.url).pathname);
    const path = join(out, name);
    await writeFile(path, bytes);
    files.push(path);
  }
  return { dir: out, manifest: join(out, 'manifest.json'), files, jobId: job.jobId };
}
