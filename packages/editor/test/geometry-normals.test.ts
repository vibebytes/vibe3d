import { describe, expect, it } from 'vitest';
import { createGeometry } from '../src/three/geometry';

describe('baked geometry normals', () => {
  it('使用自带 normals，而不是从面重算', () => {
    const g = createGeometry({
      type: 'baked',
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      bbox: { min: [0, 0, 0], max: [1, 0, 1] },
    });
    const normal = g.getAttribute('normal');
    expect(normal.count).toBe(3);
    expect(normal.getX(0)).toBeCloseTo(0, 6);
    expect(normal.getY(0)).toBeCloseTo(1, 6);
    expect(normal.getZ(0)).toBeCloseTo(0, 6);
  });

  it('没有 normals 时回落到面法线', () => {
    const g = createGeometry({
      type: 'baked',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      bbox: { min: [0, 0, 0], max: [1, 1, 0] },
    });
    expect(g.getAttribute('normal').getZ(0)).toBeCloseTo(1, 6);
  });
});
