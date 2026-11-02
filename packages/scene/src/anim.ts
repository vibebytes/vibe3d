import type { ClipKey, ClipSpec, SceneDoc, TrackSpec, Transform } from '@vibebyte/vibe3d-protocol';

const TAU = Math.PI * 2;

type Channel = 'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz' | 'sx' | 'sy' | 'sz';

const DEFAULT_CHANNEL: Record<NonNullable<ClipSpec['type']>, Channel> = {
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
    case 'sway': {
      const theta = TAU * (clip.frequency ?? DEFAULT_FREQUENCY) * time + phase;
      const gust = clip.gust ?? 0;
      const envelope = gust === 0 ? 1 : 1 + gust * 0.5 * (1 - Math.cos(theta / 3));
      return amplitude * Math.sin(theta) * envelope;
    }
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

type TrackValue = number | boolean | [number, number, number];

function lerpVec(
  a: [number, number, number],
  b: [number, number, number],
  u: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function catmullRom(
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  u: number,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const a = p0[i] ?? 0;
    const b = p1[i] ?? 0;
    const c = p2[i] ?? 0;
    const d = p3[i] ?? 0;
    const u2 = u * u;
    const u3 = u2 * u;
    out[i] = 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  }
  return out;
}

function asVec(v: TrackValue): [number, number, number] {
  return Array.isArray(v) ? v : [0, 0, 0];
}

export function sampleTrack(track: TrackSpec, t: number): TrackValue {
  const sorted = [...track.keys].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  if (!first) return 0;
  if (t <= first.t) return first.v as TrackValue;
  const last = sorted[sorted.length - 1];
  if (!last) return 0;
  if (t >= last.t) return last.v as TrackValue;
  const interp = track.interp ?? 'linear';
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    if (t > b.t) continue;
    if (interp === 'step') return a.v as TrackValue;
    const span = b.t - a.t;
    const u = span <= 0 ? 1 : (t - a.t) / span;
    if (Array.isArray(a.v) && Array.isArray(b.v)) {
      if (interp === 'cubic') {
        const prev = sorted[i - 1] ?? a;
        const next = sorted[i + 2] ?? b;
        return catmullRom(asVec(prev.v as TrackValue), a.v, b.v, asVec(next.v as TrackValue), u);
      }
      return lerpVec(a.v, b.v, interp === 'ease' ? ease(u, 'easeInOut') : u);
    }
    if (typeof a.v === 'number' && typeof b.v === 'number') {
      return a.v + (b.v - a.v) * (interp === 'ease' ? ease(u, 'easeInOut') : u);
    }
    return a.v as TrackValue;
  }
  return last.v as TrackValue;
}

export interface BoneTrack {
  bone: string;
  property: 'rotation' | 'position' | 'scale';
  track: TrackSpec;
}

export function boneTracksOf(clip: ClipSpec): BoneTrack[] {
  const out: BoneTrack[] = [];
  for (const track of clip.tracks ?? []) {
    const match = /^bone\.(.+)\.(rotation|position|scale)$/.exec(track.path);
    if (!match) continue;
    out.push({
      bone: match[1] ?? '',
      property: match[2] as BoneTrack['property'],
      track,
    });
  }
  return out;
}

function applyTracks(base: Transform, clip: ClipSpec, t: number): Transform {
  const tracks = clip.tracks;
  if (!tracks || tracks.length === 0) return base;
  const time = clipTime(clip, t);
  const p: [number, number, number] = [...base.p];
  const r: [number, number, number] = [...base.r];
  const s: [number, number, number] = [...base.s];
  for (const track of tracks) {
    const value = sampleTrack(track, time);
    if (track.path === 'position' && Array.isArray(value)) p.splice(0, 3, ...value);
    else if (track.path === 'rotation' && Array.isArray(value)) r.splice(0, 3, ...value);
    else if (track.path === 'scale' && Array.isArray(value)) s.splice(0, 3, ...value);
  }
  return { p, r, s };
}

export function applyClipTransform(base: Transform, clip: ClipSpec, t: number): Transform {
  const tracked = applyTracks(base, clip, t);
  if (clip.type === undefined) return tracked;
  const channel = clipChannelOf(clip);
  const value = sampleClip(clip, t);
  const p: [number, number, number] = [...tracked.p];
  const r: [number, number, number] = [...tracked.r];
  const s: [number, number, number] = [...tracked.s];
  const axis = channel[1];
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  if (channel[0] === 'p') p[index] += value;
  else if (channel[0] === 'r') r[index] += value;
  else s[index] *= 1 + value;
  return { p, r, s };
}

export function clipChannelOf(clip: ClipSpec): Channel {
  return clip.type === 'sway' && clip.axis
    ? (`r${clip.axis}` as Channel)
    : (clip.channel ?? DEFAULT_CHANNEL[clip.type ?? 'keyframes']);
}

const isTracksOnly = (clip: ClipSpec): boolean =>
  clip.tracks !== undefined &&
  (clip.type === undefined || (clip.type === 'keyframes' && !clip.keys?.length && !clip.channel));

/** Identity used to decide whether a new define replaces an existing clip on the same node. */
export function clipKeyOf(clip: ClipSpec): string {
  return isTracksOnly(clip)
    ? `tracks:${(clip.tracks ?? [])
        .map((track) => track.path)
        .sort()
        .join(',')}`
    : clipChannelOf(clip);
}

type ClipCarrier = { clip?: ClipSpec; clips?: ClipSpec[] };

export function nodeClipsOf(node: ClipCarrier | undefined): ClipSpec[] {
  if (!node) return [];
  if (node.clips !== undefined) return node.clips;
  return node.clip ? [node.clip] : [];
}

export function applyNodeClips(base: Transform, clips: ClipSpec[], t: number): Transform {
  let out = base;
  for (const clip of clips) out = applyClipTransform(out, clip, t);
  return out;
}

/** A copy of the doc with every procedural clip evaluated at time t and written into node transforms. */
export function posedDoc(doc: SceneDoc, t: number): SceneDoc {
  const nodes = Object.fromEntries(
    Object.entries(doc.nodes).map(([id, node]) => {
      const clips = nodeClipsOf(node as ClipCarrier);
      return [
        id,
        clips.length === 0 ? node : { ...node, transform: applyNodeClips(node.transform, clips, t) },
      ];
    }),
  );
  return { ...doc, nodes } as SceneDoc;
}
