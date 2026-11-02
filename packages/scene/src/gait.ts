import type { ClipSpec } from '@vibebyte/vibe3d-protocol';

type Vec3 = [number, number, number];
type Track = NonNullable<ClipSpec['tracks']>[number];

export type GaitStyle = 'walk' | 'run' | 'idle';

export interface GaitSpec {
  style: GaitStyle;
  /** Seconds per full cycle (two steps). */
  period?: number;
  /** Step length in metres; the root drifts stride * 2 / period per second. */
  stride?: number;
  /** Shoulder swing amplitude in radians. */
  armSwing?: number;
  /** Time-axis multiplier. */
  speed?: number;
  /** Direction of travel in radians about +Y; 0 walks along +Z. */
  heading?: number;
}

/** Bones every gait track targets; a model must have all of them. */
export const GAIT_BONES = [
  'Hips',
  'Spine',
  'Chest',
  'UpperArm_L',
  'LowerArm_L',
  'UpperArm_R',
  'LowerArm_R',
  'UpperLeg_L',
  'LowerLeg_L',
  'Foot_L',
  'UpperLeg_R',
  'LowerLeg_R',
  'Foot_R',
] as const;

interface Style {
  period: number;
  stride: number;
  armSwing: number;
  kneeMin: number;
  kneeAmp: number;
  elbow: number;
  bob: number;
  lean: number;
  twist: number;
}

const STYLES: Record<GaitStyle, Style> = {
  walk: {
    period: 1.1,
    stride: 0.7,
    armSwing: 0.4,
    kneeMin: 0.1,
    kneeAmp: 0.6,
    elbow: 0.25,
    bob: 0.015,
    lean: 0.03,
    twist: 0.08,
  },
  run: {
    period: 0.7,
    stride: 1.1,
    armSwing: 0.9,
    kneeMin: 0.25,
    kneeAmp: 1.2,
    elbow: 1.2,
    bob: 0.04,
    lean: 0.18,
    twist: 0.16,
  },
  idle: {
    period: 3,
    stride: 0,
    armSwing: 0,
    kneeMin: 0,
    kneeAmp: 0,
    elbow: 0.12,
    bob: 0.004,
    lean: 0,
    twist: 0.015,
  },
};

const LEG_LENGTH = 0.9;
const SAMPLES = 16;

const track = (path: string, at: (phase: number) => number | Vec3, blend?: 'additive'): Track => ({
  path,
  ...(blend ? { blend } : {}),
  keys: Array.from({ length: SAMPLES + 1 }, (_, i) => ({
    t: i / SAMPLES,
    v: at((i / SAMPLES) * Math.PI * 2),
  })),
});

/** Keys are authored on a unit period, then stretched to `period` seconds. */
const scaled = (t: Track, period: number): Track => ({
  ...t,
  keys: t.keys.map((k) => ({ ...k, t: k.t * period })),
});

/** A looping procedural gait as `bone.*` tracks plus root drift. Rotations are euler radians; −X swings a limb forward. */
export function gaitClip(spec: GaitSpec): ClipSpec {
  const base = STYLES[spec.style];
  const period = spec.period ?? base.period;
  const stride = spec.stride ?? base.stride;
  const arm = spec.armSwing ?? base.armSwing;
  const swing = Math.asin(Math.min(1, stride / (2 * LEG_LENGTH)));
  const idle = spec.style === 'idle';
  const thigh = (phase: number) => -swing * Math.sin(phase);
  const knee = (phase: number) => base.kneeMin + (base.kneeAmp * (1 + Math.cos(phase + 0.4))) / 2;
  const leg = (s: 'L' | 'R', offset: number): Track[] => [
    track(`bone.UpperLeg_${s}.rotation`, (p) => [thigh(p + offset), 0, 0]),
    track(`bone.LowerLeg_${s}.rotation`, (p) => [knee(p + offset), 0, 0]),
    track(`bone.Foot_${s}.rotation`, (p) => [-0.5 * (thigh(p + offset) + knee(p + offset)), 0, 0]),
  ];
  const armTrack = (s: 'L' | 'R', offset: number): Track[] => [
    track(`bone.UpperArm_${s}.rotation`, (p) => [
      idle ? 0 : arm * Math.sin(p + offset),
      0,
      s === 'L' ? 0.08 : -0.08,
    ]),
    track(`bone.LowerArm_${s}.rotation`, (p) => [
      -(base.elbow + (idle ? 0 : (0.15 * (1 + Math.sin(p + offset))) / 2)),
      0,
      0,
    ]),
  ];
  const tracks = [
    track('bone.Hips.rotation', (p) => [base.lean, base.twist * Math.sin(p), 0], 'additive'),
    track('bone.Hips.position', (p) => [0, base.bob * Math.cos(2 * p), 0], 'additive'),
    track('bone.Spine.rotation', (p) => [0, -base.twist * 0.5 * Math.sin(p), 0], 'additive'),
    track('bone.Chest.rotation', (p) => [0, -base.twist * 0.5 * Math.sin(p), 0], 'additive'),
    ...(idle ? [] : [...leg('L', 0), ...leg('R', Math.PI)]),
    ...armTrack('L', 0),
    ...armTrack('R', Math.PI),
  ].map((t) => scaled(t, period));
  const heading = spec.heading ?? 0;
  const speed = (stride * 2) / period;
  return {
    loop: true,
    duration: period,
    ...(spec.speed !== undefined ? { speed: spec.speed } : {}),
    ...(stride > 0 ? { drift: [Math.sin(heading) * speed, 0, Math.cos(heading) * speed] as Vec3 } : {}),
    tracks,
  };
}
