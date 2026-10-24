import type { CapParams } from '@vibebyte/vibe3d-client';
import { type ParsedArgs, bool, num, str, vec } from './args';

type Flags = ParsedArgs['flags'];

const OPS = ['subtract', 'union', 'intersect'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;

function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as Partial<T>;
}

export function decalFromFlags(flags: Flags): Omit<CapParams<'decal.create'>, 'roomId'> {
  const text = str(flags, 'text');
  const imageSha = str(flags, 'image-sha');
  if (!text && !imageSha) throw new Error('decal create 需要 --text 或 --image-sha');
  if (text && imageSha) throw new Error('decal create 的 --text 与 --image-sha 二选一');

  const align = str(flags, 'align');
  if (align && !ALIGNS.includes(align as (typeof ALIGNS)[number])) {
    throw new Error(`--align 只支持 ${ALIGNS.join(' / ')}，收到：${align}`);
  }

  return pick({
    text,
    imageSha,
    width: num(flags, 'width'),
    height: num(flags, 'height'),
    position: vec(flags, 'at'),
    rotation: vec(flags, 'rotation'),
    color: str(flags, 'color'),
    background: str(flags, 'background'),
    fontSize: num(flags, 'font-size'),
    bold: flags.bold === undefined ? undefined : bool(flags, 'bold'),
    align,
    parent: str(flags, 'parent'),
  }) as Omit<CapParams<'decal.create'>, 'roomId'>;
}

export function booleanFromFlags(
  flags: Flags,
): Omit<CapParams<'mesh.boolean'>, 'roomId' | 'target' | 'tool'> {
  const op = str(flags, 'op') ?? 'subtract';
  if (!OPS.includes(op as (typeof OPS)[number])) {
    throw new Error(`--op 只支持 ${OPS.join(' / ')}，收到：${op}`);
  }
  return { op: op as (typeof OPS)[number], deleteTool: !bool(flags, 'keep-tool') };
}
