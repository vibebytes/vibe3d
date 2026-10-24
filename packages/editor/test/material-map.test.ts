import type { Material } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { toStandardMaterial, toToonMaterial } from '../src/three/materials';

const BASE: Material = {
  baseColor: [0.8, 0.8, 0.8, 1],
  metalness: 0,
  roughness: 0.5,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
};

const loader = () => new THREE.Texture();

describe('toStandardMaterial map', () => {
  it('loads the map and applies nested uv', () => {
    const spec = {
      ...BASE,
      map: {
        sha: 'a'.repeat(64),
        uv: { repeat: [2, 3], offset: [0.1, 0.2], rotation: 0.5, channel: 1 },
      },
    } as unknown as Material;

    const mat = toStandardMaterial(spec, loader);
    expect(mat.map).not.toBeNull();
    expect(mat.map?.repeat.toArray()).toEqual([2, 3]);
    expect(mat.map?.offset.toArray()).toEqual([0.1, 0.2]);
    expect(mat.map?.rotation).toBeCloseTo(0.5, 12);
    expect(mat.map?.center.toArray()).toEqual([0.5, 0.5]);
    expect(mat.map?.channel).toBe(1);
  });

  it('accepts the legacy flat fields', () => {
    const spec = {
      ...BASE,
      map: { sha: 'b'.repeat(64), tiling: [4, 0.5], offset: [-0.25, 0.75], rotation: 0 },
    } as Material;

    const mat = toStandardMaterial(spec, loader);
    expect(mat.map?.repeat.toArray()).toEqual([4, 0.5]);
    expect(mat.map?.offset.toArray()).toEqual([-0.25, 0.75]);
    expect(mat.map?.channel).toBe(0);
  });

  it('keeps an untextured material texture-free', () => {
    expect(toStandardMaterial(BASE, loader).map).toBeNull();
  });
});

describe('toToonMaterial map', () => {
  it('loads the map and applies nested uv', () => {
    const spec = {
      ...BASE,
      map: {
        sha: 'c'.repeat(64),
        uv: { repeat: [1, 2], offset: [0.5, 0], rotation: 0, channel: 0 },
      },
    } as unknown as Material;

    const ramp = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    const mat = toToonMaterial(spec, 3, ramp, loader);
    expect(mat.map).not.toBeNull();
    expect(mat.map?.repeat.toArray()).toEqual([1, 2]);
    expect(mat.map?.offset.toArray()).toEqual([0.5, 0]);
  });
});
