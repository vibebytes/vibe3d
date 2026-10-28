import { describe, expect, it } from 'vitest';
import { tubeMesh } from '../src/tube';

type Vec3 = [number, number, number];

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;

const rings = (positions: number[], radial: number): Vec3[][] => {
  const ringCount = positions.length / 3 / (radial + 1);
  const out: Vec3[][] = [];
  for (let i = 0; i < ringCount; i += 1) {
    const ring: Vec3[] = [];
    for (let j = 0; j <= radial; j += 1) {
      const o = (i * (radial + 1) + j) * 3;
      ring.push([positions[o]!, positions[o + 1]!, positions[o + 2]!]);
    }
    out.push(ring);
  }
  return out;
};

const center = (ring: Vec3[]): Vec3 => {
  const body = ring.slice(0, -1);
  const sum: Vec3 = [0, 0, 0];
  for (const p of body) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / body.length, sum[1] / body.length, sum[2] / body.length];
};

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('tubeMesh', () => {
  it('直线：segments+1 个环，每环半径恒定，包围盒贴合', () => {
    const m = tubeMesh({
      points: [
        [0, 0, 0],
        [2, 0, 0],
      ],
      radius: 0.05,
      segments: 4,
      radialSegments: 8,
    });
    expect(m.positions.length / 3).toBe(5 * 9);
    expect(m.indices.length).toBe(4 * 8 * 6);
    const rs = rings(m.positions, 8);
    let prev = -1;
    for (const ring of rs) {
      const c = center(ring);
      expect(c[0]).toBeGreaterThanOrEqual(prev);
      prev = c[0];
      expect(c[1]).toBeCloseTo(0, 6);
      expect(c[2]).toBeCloseTo(0, 6);
      for (const p of ring) expect(dist(p, c)).toBeCloseTo(0.05, 6);
    }
    expect(center(rs[0]!)[0]).toBeCloseTo(0, 6);
    expect(center(rs[4]!)[0]).toBeCloseTo(2, 6);
    expect(m.bbox.min[0]).toBeCloseTo(0, 6);
    expect(m.bbox.max[0]).toBeCloseTo(2, 6);
    expect(m.bbox.min[1]).toBeCloseTo(-0.05, 6);
    expect(m.bbox.max[1]).toBeCloseTo(0.05, 6);
  });

  it('L 形折线：曲线穿过拐点，环心落在折线上且半径不变', () => {
    const m = tubeMesh({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
      ],
      radius: 0.08,
      segments: 8,
      radialSegments: 8,
    });
    const rs = rings(m.positions, 8);
    const corner = center(rs[4]!);
    expect(corner[0]).toBeCloseTo(1, 6);
    expect(corner[1]).toBeCloseTo(0, 6);
    expect(corner[2]).toBeCloseTo(0, 6);
    for (const ring of rs) {
      const c = center(ring);
      for (const p of ring) expect(dist(p, c)).toBeCloseTo(0.08, 6);
    }
    expect(m.bbox.min[1]).toBeCloseTo(-0.08, 3);
    expect(m.bbox.max[1]).toBeCloseTo(0.08, 3);
    expect(m.bbox.min[2]).toBeLessThan(-0.08);
    expect(m.bbox.min[2]).toBeGreaterThan(-0.2);
    expect(m.bbox.max[2]).toBeGreaterThanOrEqual(1);
  });

  it('半径曲线：起点 radius 线性收到 radiusEnd', () => {
    const m = tubeMesh({
      points: [
        [0, 0, 0],
        [0, 3, 0],
      ],
      radius: 0.1,
      radiusEnd: 0,
      segments: 6,
      radialSegments: 8,
    });
    const rs = rings(m.positions, 8);
    const first = center(rs[0]!);
    const last = center(rs[6]!);
    for (const p of rs[0]!) expect(dist(p, first)).toBeCloseTo(0.1, 6);
    for (const p of rs[6]!) expect(dist(p, last)).toBeLessThan(1e-6);
    expect(last[1]).toBeCloseTo(3, 6);
  });

  it('closed：环数等于 segments，首尾不重复', () => {
    const m = tubeMesh({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      radius: 0.1,
      segments: 8,
      radialSegments: 4,
      closed: true,
    });
    expect(m.positions.length / 3).toBe(8 * 5);
    const rs = rings(m.positions, 4);
    expect(dist(center(rs[0]!), center(rs[7]!))).toBeGreaterThan(0.1);
    expect(m.bbox.min[0]).toBeLessThan(-0.1);
    expect(m.bbox.min[0]).toBeGreaterThan(-0.3);
    expect(m.bbox.max[2]).toBeGreaterThan(1);
  });

  it('退化输入：所有点重合直接报 E_INVALID_PARAMS', () => {
    let err: unknown;
    try {
      tubeMesh({
        points: [
          [1, 1, 1],
          [1, 1, 1],
        ],
        radius: 0.1,
      });
    } catch (e) {
      err = e;
    }
    expect(codeOf(err)).toBe('E_INVALID_PARAMS');
  });
});
