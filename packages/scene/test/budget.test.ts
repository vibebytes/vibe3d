import { describe, expect, it } from 'vitest';
import { checkBudget } from '../src/budget';
import type { SceneStats } from '../src/stats';

const stats: SceneStats = {
  nodes: 12,
  byKind: { mesh: 10, light: 2 },
  meshes: 10,
  tris: 40,
  materials: 3,
  textures: 2,
  drawCallsEst: 10,
};

describe('checkBudget', () => {
  it('未设限时全部指标为 null 且不超限', () => {
    const report = checkBudget(stats, {});
    expect(report.over).toEqual([]);
    expect(report.metrics.maxNodes).toBeNull();
    expect(report.metrics.maxTris).toBeNull();
    expect(report.metrics.maxTextures).toBeNull();
  });

  it('限内给出余量与占比', () => {
    const report = checkBudget(stats, { maxNodes: 20, maxTris: 40, maxTextures: 8 });
    expect(report.over).toEqual([]);
    expect(report.metrics.maxNodes).toEqual({
      limit: 20,
      used: 12,
      remaining: 8,
      ratio: 0.6,
      exceeded: false,
    });
    expect(report.metrics.maxTris?.remaining).toBe(0);
    expect(report.metrics.maxTextures?.ratio).toBe(0.25);
  });

  it('超限时余量为负且按节点→三角面→贴图顺序列出', () => {
    const report = checkBudget(stats, { maxTextures: 1, maxTris: 30, maxNodes: 10 });
    expect(report.over).toEqual(['maxNodes', 'maxTris', 'maxTextures']);
    expect(report.metrics.maxTris).toEqual({
      limit: 30,
      used: 40,
      remaining: -10,
      ratio: 1.33,
      exceeded: true,
    });
  });

  it('零限值配零用量不算超限，非零用量算超限', () => {
    expect(checkBudget(stats, { maxNodes: 0 }).metrics.maxNodes).toEqual({
      limit: 0,
      used: 12,
      remaining: -12,
      ratio: 1,
      exceeded: true,
    });
    expect(checkBudget({ ...stats, tris: 0 }, { maxTris: 0 }).over).toEqual([]);
  });

  it('超出量文案逐项列出缺多少', () => {
    const report = checkBudget(stats, { maxNodes: 10, maxTris: 44 });
    expect(report.hint).toContain('节点超出 2');
    expect(report.hint).toContain('三角面余量 4');
  });
});
