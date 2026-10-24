import type { Material } from '@vibebyte/vibe3d-protocol';
import { normalizeMap } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';
import { assetUrl } from '../lib/rpc';

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

export type MapTextureLoader = (sha: string) => THREE.Texture;

const mapTextures = new Map<string, THREE.Texture>();

const loadAssetTexture: MapTextureLoader = (sha) => {
  const hit = mapTextures.get(sha);
  if (hit) return hit;
  const texture = new THREE.TextureLoader().load(assetUrl(sha));
  texture.colorSpace = THREE.SRGBColorSpace;
  mapTextures.set(sha, texture);
  return texture;
};

function attachMap(
  target: THREE.MeshStandardMaterial | THREE.MeshToonMaterial,
  spec: Material,
  load: MapTextureLoader,
): void {
  const map = normalizeMap(spec.map);
  if (!map) return;
  const texture = load(map.sha).clone();
  texture.center.set(0.5, 0.5);
  texture.repeat.set(...(map.tiling ?? [1, 1]));
  texture.offset.set(...(map.offset ?? [0, 0]));
  texture.rotation = map.rotation ?? 0;
  texture.channel = map.channel ?? 0;
  texture.needsUpdate = true;
  target.map = texture;
  target.needsUpdate = true;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function toStandardMaterial(
  spec: Material,
  load: MapTextureLoader = loadAssetTexture,
): THREE.MeshStandardMaterial {
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
  attachMap(mat, spec, load);
  cache.set(key, mat);
  return mat;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toToonMaterial(
  spec: Material,
  steps: number,
  ramp: THREE.DataTexture,
  load: MapTextureLoader = loadAssetTexture,
): THREE.MeshToonMaterial {
  const key = `${steps}:${JSON.stringify(spec)}`;
  const hit = toonCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshToonMaterial({
    color: rgbColor(spec.baseColor),
    gradientMap: ramp,
    emissive: rgbColor(spec.emissive),
    emissiveIntensity: spec.emissiveIntensity,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  attachMap(mat, spec, load);
  toonCache.set(key, mat);
  return mat;
}

let fallback: THREE.MeshStandardMaterial | null = null;

export function fallbackMaterial(): THREE.MeshStandardMaterial {
  fallback ??= new THREE.MeshStandardMaterial({ color: '#8b98a5' });
  return fallback;
}

export function disposeMaterialCache(): void {
  for (const mat of cache.values()) {
    mat.map?.dispose();
    mat.dispose();
  }
  cache.clear();
  for (const mat of toonCache.values()) {
    mat.map?.dispose();
    mat.dispose();
  }
  toonCache.clear();
}
