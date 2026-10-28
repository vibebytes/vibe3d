import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyShadowResolution, qualityOf } from '../src/viewport/capture-quality';

function makeScene(): {
  scene: THREE.Scene;
  dir: THREE.DirectionalLight;
  spot: THREE.SpotLight;
  ambient: THREE.AmbientLight;
} {
  const scene = new THREE.Scene();
  const dir = new THREE.DirectionalLight(0xffffff, 2);
  dir.castShadow = true;
  const spot = new THREE.SpotLight(0xffffff, 3);
  spot.castShadow = true;
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(dir, spot, ambient);
  return { scene, dir, spot, ambient };
}

describe('applyShadowResolution', () => {
  it('resizes shadow maps of casting lights and restores previous sizes', () => {
    const { scene, dir, spot } = makeScene();
    expect(dir.shadow.mapSize.x).toBe(512);

    const restore = applyShadowResolution(scene, 2048);
    expect(dir.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(spot.shadow.mapSize.toArray()).toEqual([2048, 2048]);

    restore();
    expect(dir.shadow.mapSize.toArray()).toEqual([512, 512]);
  });

  it('leaves lights that do not cast shadows untouched', () => {
    const { scene, ambient } = makeScene();
    const restore = applyShadowResolution(scene, 2048);
    expect(ambient.castShadow).toBe(false);
    restore();
  });

  it('drops stale shadow maps so the new size takes effect', () => {
    const { scene, dir } = makeScene();
    const dispose = vi.fn();
    dir.shadow.map = { dispose } as unknown as THREE.WebGLRenderTarget;

    const restore = applyShadowResolution(scene, 4096);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dir.shadow.map).toBeNull();

    restore();
    expect(dir.shadow.mapSize.x).toBe(512);
  });

  it('is a no-op when the size already matches', () => {
    const { scene, dir } = makeScene();
    dir.shadow.mapSize.set(1024, 1024);
    const restore = applyShadowResolution(scene, 1024);
    expect(dir.shadow.mapSize.x).toBe(1024);
    restore();
    expect(dir.shadow.mapSize.x).toBe(1024);
  });
});

describe('qualityOf', () => {
  it('falls back to the standard preset', () => {
    expect(qualityOf(undefined)).toMatchObject({ level: 'standard', pixelRatio: 1, samples: 4 });
  });

  it('passes through an explicit preset', () => {
    expect(
      qualityOf({ level: 'high', pixelRatio: 2, samples: 4, shadowMapSize: 2048, supersample: true }),
    ).toMatchObject({ level: 'high', pixelRatio: 2 });
  });
});
