import { createHmac, timingSafeEqual } from 'node:crypto';

export const EXPORT_FILE_RE = /^[a-f0-9]{32}(-\d{4})?\.(glb|json|png)$/;
export const EXPORT_LINK_TTL_MS = 10 * 60_000;

const MIME: Record<string, string> = {
  glb: 'model/gltf-binary',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
};

export function exportKey(file: string): string {
  return file.slice(0, file.lastIndexOf('.'));
}

export function exportMime(file: string): string {
  return MIME[file.slice(file.lastIndexOf('.') + 1)] ?? 'application/octet-stream';
}

function sigOf(token: string, key: string, exp: number): string {
  return createHmac('sha256', token).update(`${key}:${exp}`).digest('hex').slice(0, 32);
}

export function signExportUrl(
  token: string | undefined,
  file: string,
  ttlMs = EXPORT_LINK_TTL_MS,
  now: () => number = Date.now,
): string {
  if (!token) return `/exports/${file}`;
  const exp = now() + ttlMs;
  const sig = sigOf(token, exportKey(file), exp);
  return `/exports/${file}?exp=${exp}&sig=${sig}`;
}

export function verifyExportSig(token: string | undefined, file: string, exp: number, sig: string): boolean {
  if (!token) return true;
  if (!Number.isFinite(exp)) return false;
  const want = Buffer.from(sigOf(token, exportKey(file), exp));
  const given = Buffer.from(sig);
  return given.length === want.length && timingSafeEqual(given, want);
}
