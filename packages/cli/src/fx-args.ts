import type { ClipSpec, Fog, FxSpec } from '@vibebyte/vibe3d-protocol';
import { type ParsedArgs, bool, num, str, vec } from './args';

type Flags = ParsedArgs['flags'];

const CLIP_TYPES = ['sway', 'ripple', 'float', 'flicker', 'spin', 'keyframes'] as const;
const CHANNELS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'] as const;
const FX_TYPES = ['particles', 'shaft'] as const;

function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as Partial<T>;
}

function optionalBool(flags: Flags, key: string): boolean | undefined {
  return flags[key] === undefined ? undefined : bool(flags, key);
}

export function parseColor(input?: string): [number, number, number, number] | undefined {
  if (!input) return undefined;
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    throw new Error(`颜色需要 #rrggbb 或 #rrggbbaa：${input}`);
  }
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return [channel(0), channel(2), channel(4), hex.length === 8 ? channel(6) : 1];
}

export function clipFromFlags(flags: Flags): ClipSpec {
  const type = str(flags, 'type');
  if (!type) throw new Error('anim define 需要 --type');
  if (!CLIP_TYPES.includes(type as (typeof CLIP_TYPES)[number])) {
    throw new Error(`未知动画类型 ${type}`);
  }
  const channel = str(flags, 'channel');
  if (channel && !CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
    throw new Error(`未知通道 ${channel}`);
  }
  return pick({
    type,
    channel,
    amplitude: num(flags, 'amplitude'),
    frequency: num(flags, 'frequency'),
    phase: num(flags, 'phase'),
    speed: num(flags, 'speed'),
    loop: optionalBool(flags, 'loop'),
    duration: num(flags, 'duration'),
  }) as ClipSpec;
}

export function applyToFromFlags(flags: Flags): 'node' | 'subtree' | undefined {
  const value = str(flags, 'apply-to');
  if (!value) return undefined;
  if (value !== 'node' && value !== 'subtree') throw new Error(`--apply-to 只支持 node|subtree：${value}`);
  return value;
}

export function playOptsFromFlags(flags: Flags): {
  clip?: string;
  speed?: number;
  loop?: boolean;
  direction?: 'forward' | 'reverse';
  weight?: number;
} {
  const raw = str(flags, 'direction');
  if (raw && raw !== 'forward' && raw !== 'reverse') {
    throw new Error(`--direction 只支持 forward|reverse：${raw}`);
  }
  const direction = raw === 'forward' || raw === 'reverse' ? raw : undefined;
  return pick({
    clip: str(flags, 'clip'),
    speed: num(flags, 'speed'),
    loop: optionalBool(flags, 'loop'),
    direction,
    weight: num(flags, 'weight'),
  });
}

export function fxSpecFromFlags(flags: Flags): Omit<FxSpec, 'id'> {
  const type = str(flags, 'type') ?? 'particles';
  if (!FX_TYPES.includes(type as (typeof FX_TYPES)[number])) {
    throw new Error(`未知特效类型 ${type}`);
  }
  return pick({
    type,
    nodeId: str(flags, 'node'),
    position: vec(flags, 'position'),
    spread: vec(flags, 'spread'),
    rate: num(flags, 'rate'),
    life: num(flags, 'life'),
    size: num(flags, 'size'),
    color: parseColor(str(flags, 'color')),
    gravity: vec(flags, 'gravity'),
    speed: num(flags, 'speed'),
    billboard: optionalBool(flags, 'billboard'),
    length: num(flags, 'length'),
    radiusTop: num(flags, 'radius-top'),
    radiusBottom: num(flags, 'radius-bottom'),
    intensity: num(flags, 'intensity'),
  }) as Omit<FxSpec, 'id'>;
}

export function fogFromFlags(flags: Flags): { fog: Fog | null } | undefined {
  if (flags.fog === false) return { fog: null };
  const raw = str(flags, 'fog');
  if (!raw) return undefined;
  const parts = raw.split(',').map((item) => Number(item.trim()));
  const near = parts[0];
  const far = parts[1];
  if (
    parts.length !== 2 ||
    near === undefined ||
    far === undefined ||
    !Number.isFinite(near) ||
    !Number.isFinite(far)
  ) {
    throw new Error(`--fog 需要 near,far：${raw}`);
  }
  const color = parseColor(str(flags, 'fog-color'));
  return { fog: color ? { near, far, color } : { near, far } };
}
