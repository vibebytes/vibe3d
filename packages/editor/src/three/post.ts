import type { CameraState, StageState } from '@vibebyte/vibe3d-protocol';
import { cameraBasis } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';

export type TonemapMode = 'aces' | 'linear' | 'reinhard';

type Vec3 = [number, number, number];

export interface PostPlan {
  bloom?: { strength: number; radius: number; threshold: number };
  dof?: { focus: number; aperture: number; maxBlur: number };
  ssao?: { radius: number; intensity: number };
  tonemap: TonemapMode;
}

export interface DofInput {
  aperture?: number;
  focusDistance?: number;
  fStop?: number;
  focusNode?: string;
  camera?: CameraState;
  bounds?: { min: Vec3; max: Vec3 };
}

const F8 = 8;
const F8_APERTURE = 0.02;

export function dofMap(input: DofInput): { focus: number; aperture: number; maxBlur: number } {
  const aperture = input.fStop != null ? (F8_APERTURE * F8) / input.fStop : (input.aperture ?? F8_APERTURE);
  let focus = input.focusDistance ?? 6;
  if (input.focusNode && input.camera && input.bounds) {
    const c: Vec3 = [
      (input.bounds.min[0] + input.bounds.max[0]) / 2,
      (input.bounds.min[1] + input.bounds.max[1]) / 2,
      (input.bounds.min[2] + input.bounds.max[2]) / 2,
    ];
    const basis = cameraBasis(input.camera, 1280, 720);
    focus =
      (c[0] - input.camera.p[0]) * basis.forward[0] +
      (c[1] - input.camera.p[1]) * basis.forward[1] +
      (c[2] - input.camera.p[2]) * basis.forward[2];
  }
  return { focus, aperture, maxBlur: Math.min(0.08, aperture * 2) };
}

export function syncDofFocus(
  passes: ReadonlyArray<{ uniforms?: { focus?: { value: number } } }>,
  focus: number,
): void {
  for (const pass of passes) {
    if (pass.uniforms?.focus) pass.uniforms.focus.value = focus;
  }
}

export function toneMappingOf(mode: TonemapMode): THREE.ToneMapping {
  if (mode === 'reinhard') return THREE.ReinhardToneMapping;
  if (mode === 'linear') return THREE.NoToneMapping;
  return THREE.ACESFilmicToneMapping;
}

export function postPlan(stage: StageState, dof?: Pick<DofInput, 'camera' | 'bounds'>): PostPlan | null {
  const post = stage.post;
  if (!post) return null;
  const plan: PostPlan = { tonemap: post.tonemap ?? 'aces' };
  if (post.bloom) {
    plan.bloom = {
      strength: post.bloom.intensity ?? 0.6,
      radius: 0.4,
      threshold: post.bloom.threshold ?? 0.2,
    };
  }
  if (post.dof) {
    plan.dof = dofMap({ ...post.dof, camera: dof?.camera, bounds: dof?.bounds });
  }
  if (post.ssao) {
    plan.ssao = { radius: post.ssao.radius ?? 0.6, intensity: post.ssao.intensity ?? 1 };
  }
  return plan;
}

export function needsPost(plan: PostPlan | null): plan is PostPlan {
  return Boolean(plan && (plan.bloom || plan.dof || plan.ssao || plan.tonemap !== 'aces'));
}

export type PostPass = 'render' | 'ssao' | 'dof' | 'bloom' | 'output';

export function postPasses(plan: PostPlan): PostPass[] {
  const passes: PostPass[] = ['render'];
  if (plan.ssao) passes.push('ssao');
  if (plan.dof) passes.push('dof');
  if (plan.bloom) passes.push('bloom');
  passes.push('output');
  return passes;
}
