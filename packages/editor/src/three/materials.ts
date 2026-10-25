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

export type MapTextureLoader = (
  sha: string,
  onLoad?: (texture: THREE.Texture) => void,
) => THREE.Texture;

export type TextureFetch = (
  url: string,
  onLoad: (texture: THREE.Texture) => void,
  onError: (error: unknown) => void,
) => THREE.Texture;

export type MapErrorHandler = (sha: string, error: unknown) => void;

let mapErrorHandler: MapErrorHandler | null = null;

export function setMapErrorHandler(handler: MapErrorHandler | null): void {
  mapErrorHandler = handler;
}

function reportMapError(sha: string, error: unknown): void {
  if (mapErrorHandler) {
    mapErrorHandler(sha, error);
    return;
  }
  console.warn('[vibe3d] map texture failed to load', sha, error);
}

const mapWaiters = new Map<string, Set<(texture: THREE.Texture) => void>>();

function waitForLoad(sha: string, onLoad: (texture: THREE.Texture) => void): void {
  const hit = mapWaiters.get(sha);
  if (hit) {
    hit.add(onLoad);
    return;
  }
  mapWaiters.set(sha, new Set([onLoad]));
}

export function createMapTextureLoader(fetchTexture: TextureFetch): MapTextureLoader {
  const textures = new Map<string, THREE.Texture>();

  const flush = (sha: string, texture: THREE.Texture | null, error?: unknown): void => {
    const waiters = mapWaiters.get(sha);
    mapWaiters.delete(sha);
    if (error !== undefined || texture === null) {
      reportMapError(sha, error ?? new Error('map texture load failed'));
      return;
    }
    for (const fn of waiters ?? []) fn(texture);
  };

  return (sha, onLoad) => {
    const cached = textures.get(sha);
    if (cached) {
      if (onLoad) {
        if (cached.image) onLoad(cached);
        else waitForLoad(sha, onLoad);
      }
      return cached;
    }
    const texture = fetchTexture(
      assetUrl(sha),
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        flush(sha, loaded);
      },
      (error) => {
        textures.delete(sha);
        flush(sha, null, error);
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(sha, texture);
    if (onLoad) waitForLoad(sha, onLoad);
    return texture;
  };
}

const loadAssetTexture: MapTextureLoader = createMapTextureLoader((url, onLoad, onError) =>
  new THREE.TextureLoader().load(url, onLoad, undefined, onError),
);

function attachMap(
  target: THREE.MeshStandardMaterial | THREE.MeshToonMaterial,
  spec: Material,
  load: MapTextureLoader,
): void {
  const map = normalizeMap(spec.map);
  if (!map) return;
  load(map.sha, (base) => {
    const texture = base.clone();
    texture.center.set(0.5, 0.5);
    texture.repeat.set(...(map.tiling ?? [1, 1]));
    texture.offset.set(...(map.offset ?? [0, 0]));
    texture.rotation = map.rotation ?? 0;
    texture.channel = map.channel ?? 0;
    texture.needsUpdate = true;
    target.map = texture;
    target.needsUpdate = true;
  });
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
