import { autoFogRange } from '@vibebyte/vibe3d-scene';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyCaptureFog, captureFogPlan } from '../src/viewport/capture-fog';

const DOC_FOG = { color: 0x223344, near: 10, far: 100 };

describe('W2 出图级雾自适应', () => {
  it('doc 档原样使用文档里的雾', () => {
    const plan = captureFogPlan({
      mode: 'doc',
      docFog: DOC_FOG,
      fallbackColor: 0x0b0f14,
      distance: 72,
      radius: 60,
    });
    expect(plan).toEqual(DOC_FOG);
  });

  it('文档没设雾时 doc 档不出雾', () => {
    const plan = captureFogPlan({
      mode: 'doc',
      docFog: null,
      fallbackColor: 0x0b0f14,
      distance: 72,
      radius: 60,
    });
    expect(plan).toBeNull();
  });

  it('off 档与诊断着色档都不出雾', () => {
    const off = captureFogPlan({
      mode: 'off',
      docFog: DOC_FOG,
      fallbackColor: 0x0b0f14,
      distance: 72,
      radius: 60,
    });
    expect(off).toBeNull();
    const shaded = captureFogPlan({
      mode: 'auto',
      docFog: DOC_FOG,
      fallbackColor: 0x0b0f14,
      distance: 72,
      radius: 60,
      shading: 'wireframe',
    });
    expect(shaded).toBeNull();
  });

  it('auto 档按包围盒半径重算 near/far，大场景不再整幅吃雾', () => {
    const plan = captureFogPlan({
      mode: 'auto',
      docFog: null,
      fallbackColor: 0x0b0f14,
      distance: 72,
      radius: 60,
      shading: 'rendered',
    });
    const want = autoFogRange(72, 60);
    expect(plan).toEqual({ color: 0x0b0f14, ...want });
    expect(plan?.far).toBeGreaterThan(72 + 60 * 2);
    expect(plan?.near).toBeLessThan(72);
  });

  it('auto 档优先沿用文档雾的颜色', () => {
    const plan = captureFogPlan({
      mode: 'auto',
      docFog: DOC_FOG,
      fallbackColor: 0x0b0f14,
      distance: 30,
      radius: 4,
    });
    expect(plan?.color).toBe(DOC_FOG.color);
  });

  it('applyCaptureFog 写入 scene.fog，restore 后原样复原', () => {
    const scene = new THREE.Scene();
    const prev = new THREE.Fog(0x111111, 1, 2);
    scene.fog = prev;

    const restore = applyCaptureFog(scene, { color: 0x223344, near: 5, far: 6 });
    const applied = scene.fog as THREE.Fog;
    expect(applied).toBeInstanceOf(THREE.Fog);
    expect(applied.color.getHex()).toBe(0x223344);
    expect(applied.near).toBe(5);
    expect(applied.far).toBe(6);

    restore();
    expect(scene.fog).toBe(prev);
  });

  it('plan 为 null 时清掉雾，restore 后复原', () => {
    const scene = new THREE.Scene();
    const prev = new THREE.Fog(0x111111, 1, 2);
    scene.fog = prev;
    const restore = applyCaptureFog(scene, null);
    expect(scene.fog).toBeNull();
    restore();
    expect(scene.fog).toBe(prev);
  });
});
