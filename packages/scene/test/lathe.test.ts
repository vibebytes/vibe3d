import { describe, expect, it } from 'vitest';
import { latheMesh } from '../src/sculpt';

describe('latheMesh', () => {
  it('轮廓绕 Y 轴，底面半径与高度等于输入', () => {
    const mesh = latheMesh({
      profile: [
        [0.5, 0],
        [0.35, 0.8],
        [0.1, 1.4],
      ],
      segments: 12,
    });
    expect(mesh.bbox.min[1]).toBeCloseTo(0, 4);
    expect(mesh.bbox.max[1]).toBeCloseTo(1.4, 4);
    let bottom = 0;
    let outward = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      if (Math.abs(y) < 1e-6) {
        bottom += 1;
        expect(Math.hypot(x, z)).toBeCloseTo(0.5, 3);
        const nx = mesh.normals[i]!;
        const nz = mesh.normals[i + 2]!;
        outward += x * nx + z * nz;
      }
    }
    expect(bottom).toBe(12);
    expect(outward).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});
