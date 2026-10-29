import { describe, expect, it } from 'vitest';
import { bevelMesh } from '../src/sculpt';

describe('bevelMesh', () => {
  it('倒角后包围盒仍约等于原尺寸，棱上顶点多于 8', () => {
    const size: [number, number, number] = [2, 1.2, 0.8];
    const mesh = bevelMesh({ size, radius: 0.08, segments: 4 });
    expect(mesh.bbox.max[0] - mesh.bbox.min[0]).toBeCloseTo(size[0], 1);
    expect(mesh.bbox.max[1] - mesh.bbox.min[1]).toBeCloseTo(size[1], 1);
    expect(mesh.bbox.max[2] - mesh.bbox.min[2]).toBeCloseTo(size[2], 1);
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    let edges = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const near = [
        Math.abs(Math.abs(mesh.positions[i]!) - hx),
        Math.abs(Math.abs(mesh.positions[i + 1]!) - hy),
        Math.abs(Math.abs(mesh.positions[i + 2]!) - hz),
      ].filter((d) => d < 0.12).length;
      if (near >= 2) edges += 1;
    }
    expect(edges).toBeGreaterThan(8);
    expect(mesh.positions.length / 3).toBeGreaterThan(8);
  });
});
