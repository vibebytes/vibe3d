import { describe, expect, it } from 'vitest';
import { backdropSweep } from '../src/backdrop';

type Vec3 = [number, number, number];

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;

const column = (positions: number[], k: number, side: 0 | 1): Vec3 => {
  const o = (k * 2 + side) * 3;
  return [positions[o]!, positions[o + 1]!, positions[o + 2]!];
};

const normalAt = (normals: number[], k: number, side: 0 | 1): Vec3 => {
  const o = (k * 2 + side) * 3;
  return [normals[o]!, normals[o + 1]!, normals[o + 2]!];
};

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.sqrt(dot(a, a));

const triNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

describe('backdropSweep', () => {
  it('缺省 10×4×6：剖面 seg+2 点、顶点 2 列、包围盒贴合', () => {
    const m = backdropSweep({});
    const profile = m.positions.length / 3 / 2;
    expect(profile).toBe(16 + 2);
    expect(m.positions.length).toBe(36 * 3);
    expect(m.normals.length).toBe(36 * 3);
    expect(m.indices.length).toBe(6 * (profile - 1));
    expect(m.bbox.min).toEqual([-5, 0, -4]);
    expect(m.bbox.max).toEqual([5, 6, 0]);
    expect(column(m.positions, 0, 0)).toEqual([-5, 0, 0]);
    expect(column(m.positions, profile - 1, 0)).toEqual([-5, 6, -4]);
    expect(column(m.positions, 0, 1)).toEqual([5, 0, 0]);
  });

  it('弧段落在四分之一圆上，且法线两端与地面 / 墙面严格连续', () => {
    const m = backdropSweep({ depth: 4, curve: 1.2, segments: 8 });
    const cy = 1.2;
    const cz = -(4 - 1.2);
    for (let k = 1; k <= 8; k += 1) {
      const p = column(m.positions, k, 0);
      expect(Math.hypot(p[1] - cy, p[2] - cz)).toBeCloseTo(1.2, 9);
    }
    expect(normalAt(m.normals, 0, 0)).toEqual([0, 1, 0]);
    const th = Math.PI / 2 / 8;
    expect(normalAt(m.normals, 1, 0)[0]).toBeCloseTo(0, 12);
    expect(normalAt(m.normals, 1, 0)[1]).toBeCloseTo(Math.cos(th), 12);
    expect(normalAt(m.normals, 1, 0)[2]).toBeCloseTo(Math.sin(th), 12);
    expect(normalAt(m.normals, 8, 0)[1]).toBeCloseTo(0, 12);
    expect(normalAt(m.normals, 8, 0)[2]).toBeCloseTo(1, 12);
    expect(normalAt(m.normals, 9, 0)).toEqual([0, 0, 1]);
    for (let k = 0; k < m.normals.length / 3; k += 1) {
      const n = normalAt(m.normals, Math.floor(k / 2), (k % 2) as 0 | 1);
      expect(len(n)).toBeCloseTo(1, 12);
    }
  });

  it('相邻剖面法线夹角恒定，不出现折角亮线', () => {
    const m = backdropSweep({ segments: 8 });
    const step = Math.PI / 2 / 8;
    for (let k = 1; k < 8; k += 1) {
      const a = normalAt(m.normals, k, 0);
      const b = normalAt(m.normals, k + 1, 0);
      expect(Math.acos(Math.min(1, dot(a, b)))).toBeCloseTo(step, 9);
    }
  });

  it('所有顶点不落到地面以下，三角形绕序与法线同向', () => {
    const m = backdropSweep({ depth: 3, height: 5, curve: 0.8, segments: 6 });
    for (let i = 1; i < m.positions.length; i += 3) expect(m.positions[i]!).toBeGreaterThanOrEqual(0);
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t]!;
      const b = m.indices[t + 1]!;
      const c = m.indices[t + 2]!;
      const pa: Vec3 = [m.positions[a * 3]!, m.positions[a * 3 + 1]!, m.positions[a * 3 + 2]!];
      const pb: Vec3 = [m.positions[b * 3]!, m.positions[b * 3 + 1]!, m.positions[b * 3 + 2]!];
      const pc: Vec3 = [m.positions[c * 3]!, m.positions[c * 3 + 1]!, m.positions[c * 3 + 2]!];
      const na: Vec3 = [m.normals[a * 3]!, m.normals[a * 3 + 1]!, m.normals[a * 3 + 2]!];
      expect(dot(triNormal(pa, pb, pc), na)).toBeGreaterThan(0);
    }
  });

  it('自定义宽度与段数改变几何规模', () => {
    const m = backdropSweep({ width: 20, depth: 6, height: 8, curve: 2, segments: 4 });
    expect(m.positions.length).toBe((4 + 2) * 2 * 3);
    expect(m.indices.length).toBe(6 * (4 + 1));
    expect(m.bbox.min).toEqual([-10, 0, -6]);
    expect(m.bbox.max).toEqual([10, 8, 0]);
  });

  it('非法参数一律 E_INVALID_PARAMS', () => {
    expect(codeOf(catchErr(() => backdropSweep({ width: 0 })))).toBe('E_INVALID_PARAMS');
    expect(codeOf(catchErr(() => backdropSweep({ depth: 0 })))).toBe('E_INVALID_PARAMS');
    expect(codeOf(catchErr(() => backdropSweep({ curve: 0 })))).toBe('E_INVALID_PARAMS');
    expect(codeOf(catchErr(() => backdropSweep({ height: 1, curve: 1.2 })))).toBe('E_INVALID_PARAMS');
    expect(codeOf(catchErr(() => backdropSweep({ depth: 1, curve: 1.2 })))).toBe('E_INVALID_PARAMS');
  });
});

function catchErr(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}
