import { postSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { dofMap, syncDofFocus } from '../src/three/post';

const cam = (p: [number, number, number], target: [number, number, number]) => ({
  mode: 'persp' as const,
  p,
  target,
  fov: 40,
  zoom: 1,
});

describe('dofMap', () => {
  it('f/2.8 的 aperture 大于 f/8，f/8 对齐 0.02，maxBlur 为 min(0.08, aperture*2)', () => {
    const wide = dofMap({ fStop: 2.8 });
    const mid = dofMap({ fStop: 8 });
    expect(wide.aperture).toBeGreaterThan(mid.aperture);
    expect(mid.aperture).toBeCloseTo(0.02, 5);
    expect(mid.maxBlur).toBeCloseTo(0.04, 5);
    expect(wide.maxBlur).toBeCloseTo(Math.min(0.08, wide.aperture * 2), 5);
    expect(dofMap({ fStop: 4 }).aperture).toBeGreaterThan(mid.aperture);
    expect(dofMap({ fStop: 4 }).aperture).toBeLessThan(wide.aperture);
  });

  it('focusNode 的距离是相机到包围盒中心的视线深度，不被 100 截断', () => {
    const near = dofMap({
      fStop: 8,
      focusNode: 'n_hero0001',
      camera: cam([0, 1.5, 10], [0, 1.5, 0]),
      bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    });
    expect(near.focus).toBeCloseTo(10, 3);

    const far = dofMap({
      fStop: 8,
      focusNode: 'n_far00001',
      camera: cam([0, 0, 0], [0, 0, -1]),
      bounds: { min: [-1, -1, -160], max: [1, 1, -140] },
    });
    expect(far.focus).toBeCloseTo(150, 3);
    expect(far.focus).toBeGreaterThan(100);
  });

  it('节点沿视线移远后 focus 数字变大', () => {
    const camera = cam([0, 1.5, 10], [0, 1.5, 0]);
    const here = dofMap({
      fStop: 4,
      focusNode: 'n_hero0001',
      camera,
      bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    });
    const away = dofMap({
      fStop: 4,
      focusNode: 'n_hero0001',
      camera,
      bounds: { min: [-1, 0, -21], max: [1, 2, -19] },
    });
    expect(away.focus).toBeGreaterThan(here.focus + 10);
  });

  it('Bokeh focus uniform 在节点移远后跟着变', () => {
    const camera = cam([0, 1.5, 10], [0, 1.5, 0]);
    const pass = { uniforms: { focus: { value: 1 } } };
    const here = dofMap({
      fStop: 4,
      focusNode: 'n_hero0001',
      camera,
      bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    });
    syncDofFocus([pass], here.focus);
    const away = dofMap({
      fStop: 4,
      focusNode: 'n_hero0001',
      camera,
      bounds: { min: [-1, 0, -21], max: [1, 2, -19] },
    });
    syncDofFocus([pass], away.focus);
    expect(pass.uniforms.focus.value).toBeCloseTo(away.focus, 3);
    expect(pass.uniforms.focus.value).toBeGreaterThan(here.focus + 10);
  });

  it('schema 接受 fStop 与 focusNode，focusDistance 仍被 100 截断', () => {
    const ok = postSchema.safeParse({ dof: { fStop: 2.8, focusNode: 'n_hero0001' } });
    expect(ok.success && ok.data.dof?.fStop).toBe(2.8);
    expect(ok.success && ok.data.dof?.focusNode).toBe('n_hero0001');
    expect(postSchema.safeParse({ dof: { fStop: 1 } }).success).toBe(false);
    expect(postSchema.safeParse({ dof: { fStop: 16 } }).success).toBe(true);
    expect(postSchema.safeParse({ dof: { focusDistance: 150 } }).success).toBe(false);
  });
});
