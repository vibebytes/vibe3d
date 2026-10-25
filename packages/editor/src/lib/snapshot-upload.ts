import type { ShotMeta } from '@vibebyte/vibe3d-scene';
import { daemonUrl, token } from './rpc';

export const SHOT_META_HEADER = 'x-vibe3d-shot-meta';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function shotMetaHeader(meta?: ShotMeta | null): Record<string, string> {
  if (!meta) return {};
  return { [SHOT_META_HEADER]: toBase64Url(JSON.stringify(meta)) };
}

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function fitsMaxBytes(length: number, maxBytes?: number): boolean {
  return !maxBytes || maxBytes <= 0 || length <= maxBytes;
}

export function shrinkCapture(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(64, Math.round(width * 0.7)),
    height: Math.max(64, Math.round(height * 0.7)),
  };
}

export async function uploadSnapshot(
  roomId: string,
  requestId: string,
  bytes: Uint8Array,
  mime: string,
  meta?: ShotMeta | null,
): Promise<number> {
  const res = await fetch(daemonUrl(`/r/${roomId}/snapshot/${requestId}`), {
    method: 'POST',
    headers: {
      'content-type': mime,
      ...(token() ? { authorization: `Bearer ${token()}` } : {}),
      ...shotMetaHeader(meta),
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`snapshot upload failed: HTTP ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { bytes?: number };
  return body.bytes ?? bytes.length;
}
