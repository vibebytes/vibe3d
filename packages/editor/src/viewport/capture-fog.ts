import { autoFogRange, type FogMode } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';
import type { FogSettings } from '../three/fx';

export type { FogSettings };

export interface CaptureFogInput {
  mode: FogMode;
  docFog: FogSettings | null;
  fallbackColor: number;
  distance: number;
  radius: number;
  shading?: string | null;
}

export function captureFogPlan(input: CaptureFogInput): FogSettings | null {
  if (input.mode === 'off') return null;
  if (typeof input.shading === 'string' && input.shading.length > 0 && input.shading !== 'rendered') {
    return null;
  }
  if (input.mode !== 'auto') return input.docFog;
  const range = autoFogRange(input.distance, input.radius);
  return { color: input.docFog?.color ?? input.fallbackColor, ...range };
}

export function applyCaptureFog(scene: THREE.Scene, plan: FogSettings | null): () => void {
  const prev = scene.fog;
  scene.fog = plan ? new THREE.Fog(plan.color, plan.near, plan.far) : null;
  return () => {
    scene.fog = prev;
  };
}

export function subjectSphere(scene: THREE.Scene): { center: THREE.Vector3; radius: number } {
  const root = scene.getObjectByName('vibe3d-export') ?? scene;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 0 };
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { center: sphere.center.clone(), radius: sphere.radius };
}
