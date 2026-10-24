import type { LightSpec } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { lightPlan } from '../src/three/lights';

const base = { color: [1, 1, 1, 1] as [number, number, number, number], intensity: 3 };

describe('lightPlan', () => {
  it('area 缺省为 2×1 柔光箱，朝 target 打光且不投影', () => {
    const area = lightPlan({
      ...base,
      type: 'area',
      position: [0, 3, 1],
    } as LightSpec);
    expect(area).toEqual({
      kind: 'area',
      color: '#ffffff',
      intensity: 3,
      position: [0, 3, 1],
      target: [0, 0, 0],
      width: 2,
      height: 1,
      castShadow: false,
    });
  });

  it('area 保留自定义宽高与朝向，即使传了 castShadow 也不投影', () => {
    const plan = lightPlan({
      ...base,
      type: 'area',
      position: [2, 2, 2],
      target: [0, 1, 0],
      width: 4,
      height: 0.6,
      castShadow: true,
    } as LightSpec);
    expect(plan).toMatchObject({
      kind: 'area',
      position: [2, 2, 2],
      target: [0, 1, 0],
      width: 4,
      height: 0.6,
      castShadow: false,
    });
  });

  it('point / spot 的缺省值不变', () => {
    const point = lightPlan({ ...base, type: 'point' } as LightSpec);
    expect(point).toEqual({
      kind: 'point',
      color: '#ffffff',
      intensity: 3,
      position: [0, 2, 0],
      castShadow: false,
    });

    const spot = lightPlan({ ...base, type: 'spot', castShadow: true } as LightSpec);
    expect(spot).toEqual({
      kind: 'spot',
      color: '#ffffff',
      intensity: 3,
      position: [0, 2, 0],
      angle: Math.PI / 6,
      penumbra: 0.4,
      castShadow: true,
    });
  });

  it('ambient 只带颜色与强度', () => {
    expect(lightPlan({ ...base, type: 'ambient' } as LightSpec)).toEqual({
      kind: 'ambient',
      color: '#ffffff',
      intensity: 3,
    });
  });
});
