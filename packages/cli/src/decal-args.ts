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

export function tubeFromFlags(flags: Flags): Omit<CapParams<'mesh.tube'>, 'roomId'> {
  const raw = str(flags, 'points');
  if (!raw) throw new Error('mesh tube 需要 --points x,y,z;x,y,z;…');
  const points = raw
    .split(';')
    .map((seg) => seg.trim())
    .filter((seg) => seg !== '')
    .map((seg) => {
      const parts = seg.split(',').map((v) => Number(v.trim()));
      if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) {
        throw new Error(`--points 每段需为 x,y,z，收到：${seg}`);
      }
      return parts as [number, number, number];
    });
  if (points.length < 2) throw new Error('--points 至少需要 2 个点');

  const radius = num(flags, 'radius');
  if (radius === undefined) throw new Error('mesh tube 需要 --radius r');
  const transform = pick({
    p: vec(flags, 'at'),
    r: vec(flags, 'rotation'),
    s: vec(flags, 'scale'),
  });

  return pick({
    points,
    radius,
    radiusEnd: num(flags, 'radius-end'),
    segments: num(flags, 'segments'),
    radialSegments: num(flags, 'radial'),
    closed: flags.closed === undefined ? undefined : bool(flags, 'closed'),
    transform: Object.keys(transform).length === 0 ? undefined : transform,
    color: str(flags, 'color'),
    parent: str(flags, 'parent'),
  }) as Omit<CapParams<'mesh.tube'>, 'roomId'>;
}
