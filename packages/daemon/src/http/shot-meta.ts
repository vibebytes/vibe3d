import { AppError } from '@vibebyte/vibe3d-protocol';
import { type ShotMeta, parseShotMeta } from '@vibebyte/vibe3d-scene';

export const SHOT_META_HEADER = 'x-vibe3d-shot-meta';
export const SHOT_META_MAX_BYTES = 2048;

export function parseShotMetaHeader(raw: string | undefined): ShotMeta | undefined {
  if (!raw) return undefined;
  if (raw.length > SHOT_META_MAX_BYTES) {
    throw new AppError('E_INVALID_PARAMS', `快照 meta 超过 ${SHOT_META_MAX_BYTES} 字节上限`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('E_INVALID_PARAMS', '快照 meta 不是合法的 base64url JSON');
  }
  const meta = parseShotMeta(decoded);
  if (!meta) throw new AppError('E_INVALID_PARAMS', '快照 meta 字段不完整');
  return meta;
}
