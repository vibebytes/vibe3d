import { describe, expect, it } from 'vitest';
import { treeMesh } from '../src/tree';

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
    link(b, c);
    link(c, a);
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
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  }
  return count;
}

describe('treeMesh', () => {
  it('只有一个网格、索引连通、枝端半径小于干半径、相同 seed 字节稳定', () => {
    const a = treeMesh({ height: 4, spread: 2.2, levels: 3, seed: 11, style: 'round' });
    const b = treeMesh({ height: 4, spread: 2.2, levels: 3, seed: 11, style: 'round' });
    expect(a.positions).toEqual(b.positions);
    expect(components(a.indices)).toBe(1);
    expect(a.tipRadius).toBeLessThan(a.trunkRadius);
    const nearBase = a.positions.some((_, i) => {
      if (i % 3 !== 0) return false;
      const y = a.positions[i + 1]!;
      const radial = Math.hypot(a.positions[i]!, a.positions[i + 2]!);
      return y < 0.05 && Math.abs(radial - a.trunkRadius) < 0.02;
    });
    expect(nearBase).toBe(true);
  });
});
