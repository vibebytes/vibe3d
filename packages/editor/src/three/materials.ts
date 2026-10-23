import type { Material } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';

export function rgbaHex(color: readonly number[]): string {
  const [r, g, b] = color;
  const hex = (v: number | undefined) =>
    Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbColor(color: readonly number[]): THREE.Color {
  return new THREE.Color(rgbaHex(color));
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function toStandardMaterial(spec: Material): THREE.MeshStandardMaterial {
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({
    color: rgbColor(spec.baseColor),
    metalness: spec.metalness,
    roughness: spec.roughness,
    emissive: rgbColor(spec.emissive),
    emissiveIntensity: spec.emissiveIntensity,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  cache.set(key, mat);
  return mat;
}

let fallback: THREE.MeshStandardMaterial | null = null;

export function fallbackMaterial(): THREE.MeshStandardMaterial {
  fallback ??= new THREE.MeshStandardMaterial({ color: '#8b98a5' });
  return fallback;
}

export function disposeMaterialCache(): void {
  for (const mat of cache.values()) mat.dispose();
  cache.clear();
}
