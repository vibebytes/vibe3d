import type { StageState } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';

export type TonemapMode = 'aces' | 'linear' | 'reinhard';

export interface PostPlan {
  bloom?: { strength: number; radius: number; threshold: number };
  dof?: { focus: number; aperture: number; maxBlur: number };
  ssao?: { radius: number; intensity: number };
  tonemap: TonemapMode;
}

export function toneMappingOf(mode: TonemapMode): THREE.ToneMapping {
  if (mode === 'reinhard') return THREE.ReinhardToneMapping;
  if (mode === 'linear') return THREE.NoToneMapping;
  return THREE.ACESFilmicToneMapping;
}

export function postPlan(stage: StageState): PostPlan | null {
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
    const aperture = post.dof.aperture ?? 0.02;
    plan.dof = { focus: post.dof.focusDistance ?? 6, aperture, maxBlur: Math.min(0.05, aperture) };
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
