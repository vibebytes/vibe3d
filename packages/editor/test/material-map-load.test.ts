import type { Material } from '@vibebyte/vibe3d-protocol';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MapTextureLoader,
  createMapTextureLoader,
  disposeMaterialCache,
  setMapErrorHandler,
  toStandardMaterial,
} from '../src/three/materials';

const BASE: Material = {
  baseColor: [0.8, 0.8, 0.8, 1],
  metalness: 0,
  roughness: 0.5,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
};

const SHA = 'd'.repeat(64);
const IMAGE = { width: 4, height: 4, complete: true } as unknown as HTMLImageElement;

type Fetch = Parameters<typeof createMapTextureLoader>[0];

function fakeFetch(): {
  fetch: Fetch;
  base: THREE.Texture;
  calls: () => number;
  fire: () => void;
  fail: () => void;
} {
  const base = new THREE.Texture();
  let calls = 0;
  let onLoad: ((texture: THREE.Texture) => void) | null = null;
  let onError: ((error: unknown) => void) | null = null;
  const fetch: Fetch = (_url, ok, err) => {
    calls += 1;
    onLoad = ok;
    onError = err;
    return base;
  };
  return {
    fetch,
    base,
    calls: () => calls,
    fire: () => {
      base.image = IMAGE;
      base.needsUpdate = true;
      onLoad?.(base);
    },
    fail: () => onError?.(new Error('404')),
  };
}

afterEach(() => {
  setMapErrorHandler(null);
  disposeMaterialCache();
});

describe('attachMap waits for the decoded image', () => {
  it('leaves map unbound until the loader reports the image', () => {
    const pending = fakeFetch();
    const spec = { ...BASE, map: { sha: SHA } } as unknown as Material;

    const mat = toStandardMaterial(spec, createMapTextureLoader(pending.fetch));
    expect(mat.map).toBeNull();

    pending.fire();
    expect(mat.map).not.toBeNull();
    expect(mat.map?.image).toBe(IMAGE);
  });

  it('applies uv to the bound clone exactly once', () => {
    const pending = fakeFetch();
    const cloneSpy = vi.spyOn(pending.base, 'clone');
    const spec = {
      ...BASE,
      map: { sha: SHA, uv: { repeat: [2, 3], offset: [0.25, 0.5], rotation: 0.5, channel: 0 } },
    } as unknown as Material;

    const mat = toStandardMaterial(spec, createMapTextureLoader(pending.fetch));
    pending.fire();

    expect(cloneSpy).toHaveBeenCalledTimes(1);
    expect(mat.map?.repeat.toArray()).toEqual([2, 3]);
    expect(mat.map?.offset.toArray()).toEqual([0.25, 0.5]);
    expect(mat.map?.rotation).toBeCloseTo(0.5, 12);
    expect(mat.map?.channel).toBe(0);
    expect(mat.map?.image).toBe(IMAGE);
  });

  it('fetches one texture per sha and fans out to every material', () => {
    const pending = fakeFetch();
    const load = createMapTextureLoader(pending.fetch);
    const a = toStandardMaterial({ ...BASE, map: SHA } as unknown as Material, load);
    const b = toStandardMaterial({ ...BASE, map: SHA, roughness: 0.9 } as unknown as Material, load);

    expect(pending.calls()).toBe(1);
    pending.fire();

    expect(a.map?.image).toBe(IMAGE);
    expect(b.map?.image).toBe(IMAGE);
    expect(a.map).not.toBe(b.map);
  });

  it('binds immediately when the cached texture is already decoded', () => {
    const cached = new THREE.Texture();
    cached.image = IMAGE;
    const load: MapTextureLoader = (_sha, onLoad) => {
      onLoad?.(cached);
      return cached;
    };

    const mat = toStandardMaterial({ ...BASE, map: SHA } as unknown as Material, load);
    expect(mat.map?.image).toBe(IMAGE);
  });
});

describe('map load failures', () => {
  it('reports the sha through the error handler instead of staying silent', () => {
    const seen: Array<{ sha: string; error: unknown }> = [];
    setMapErrorHandler((sha, error) => seen.push({ sha, error }));
    const pending = fakeFetch();

    const mat = toStandardMaterial(
      { ...BASE, map: SHA } as unknown as Material,
      createMapTextureLoader(pending.fetch),
    );
    pending.fail();

    expect(mat.map).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0].sha).toBe(SHA);
    expect(seen[0].error).toBeInstanceOf(Error);
  });

  it('retries a failed sha on the next request', () => {
    const pending = fakeFetch();
    const load = createMapTextureLoader(pending.fetch);

    toStandardMaterial({ ...BASE, map: SHA } as unknown as Material, load);
    pending.fail();
    toStandardMaterial({ ...BASE, map: SHA, roughness: 0.2 } as unknown as Material, load);

    expect(pending.calls()).toBe(2);
  });
});
