import type { ClipKey, ClipSpec, Transform } from '@vibebyte/vibe3d-protocol';

const TAU = Math.PI * 2;

type Channel = 'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz' | 'sx' | 'sy' | 'sz';

const DEFAULT_CHANNEL: Record<ClipSpec['type'], Channel> = {
  sway: 'rz',
  spin: 'ry',
  float: 'py',
  ripple: 'py',
  flicker: 'py',
  keyframes: 'py',
};

const DEFAULT_FREQUENCY = 0.5;

function ease(u: number, kind: ClipKey['ease']): number {
  switch (kind) {
    case 'easeIn':
      return u * u;
    case 'easeOut':
      return 1 - (1 - u) * (1 - u);
    case 'easeInOut':
      return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default:
      return u;
  }
}

function sampleKeys(keys: ClipKey[], time: number): number {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  if (!first) return 0;
  if (time <= first.t) return first.v;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    if (time <= b.t) {
      const span = b.t - a.t;
      const u = span <= 0 ? 1 : (time - a.t) / span;
      return a.v + (b.v - a.v) * ease(u, a.ease);
    }
  }
  return sorted[sorted.length - 1]?.v ?? 0;
}

function clipTime(clip: ClipSpec, t: number): number {
  const scaled = t * (clip.speed ?? 1);
  if (clip.loop && clip.duration) {
    const d = clip.duration;
    return ((scaled % d) + d) % d;
  }
  return Math.max(0, scaled);
}

export function sampleClip(clip: ClipSpec, t: number): number {
  const time = clipTime(clip, t);
  const amplitude = clip.amplitude ?? 1;
  const phase = clip.phase ?? 0;
  switch (clip.type) {
    case 'keyframes':
      return sampleKeys(clip.keys ?? [], time);
    case 'sway':
    case 'float':
    case 'ripple':
      return amplitude * Math.sin(TAU * (clip.frequency ?? DEFAULT_FREQUENCY) * time + phase);
    case 'flicker':
      return amplitude * Math.abs(Math.sin(TAU * (clip.frequency ?? DEFAULT_FREQUENCY) * time + phase));
    case 'spin':
      return TAU * (clip.speed ?? 1) * t;
    default:
      return 0;
  }
}

export function applyClipTransform(base: Transform, clip: ClipSpec, t: number): Transform {
  const channel = clip.channel ?? DEFAULT_CHANNEL[clip.type];
  const value = sampleClip(clip, t);
  const p: [number, number, number] = [...base.p];
  const r: [number, number, number] = [...base.r];
  const s: [number, number, number] = [...base.s];
  const axis = channel[1];
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  if (channel[0] === 'p') p[index] += value;
  else if (channel[0] === 'r') r[index] += value;
  else s[index] *= 1 + value;
  return { p, r, s };
}
