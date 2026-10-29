import { describe, expect, it } from 'vitest';
import { smoothMerge } from '../src/sculpt';

function sphere(center: [number, number, number], radius: number, seg = 6) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= seg; y += 1) {
    const v = y / seg;
    const phi = v * Math.PI;
    for (let x = 0; x <= seg; x += 1) {
      const u = x / seg;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(center[0] + nx * radius, center[1] + ny * radius, center[2] + nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  const stride = seg + 1;
  for (let y = 0; y < seg; y += 1) {
    for (let x = 0; x < seg; x += 1) {
      const a = y * stride + x;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  return { positions, normals, indices };
}

function components(indices: number[]): number {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const list = adj.get(a) ?? [];
    list.push(b);
    adj.set(a, list);
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    link(a, b);
    link(b, a);
    link(b, c);
    link(c, b);
    link(c, a);
    link(a, c);
  }
  const seen = new Set<number>();
  let count = 0;
  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    count += 1;
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return count;
}

describe('smoothMerge', () => {
  it('两颗重叠球并成一块连通网格', () => {
    const merged = smoothMerge([sphere([0, 0, 0], 1), sphere([0.7, 0, 0], 1)], { resolution: 10 });
    expect(merged.warning).toBeUndefined();
    expect(components(merged.indices)).toBe(1);
    expect(merged.indices.length).toBeGreaterThan(0);
  });

  it('顶点数超过 300000 时退回硬合并并带 warning', () => {
    const a = sphere([0, 0, 0], 1, 4);
    const b = sphere([0.4, 0, 0], 1, 4);
    const merged = smoothMerge([a, b], { resolution: 70 });
    expect(merged.warning).toBeTruthy();
    expect(merged.positions.length).toBe(a.positions.length + b.positions.length);
    expect(merged.indices.length).toBe(a.indices.length + b.indices.length);
  });
});
