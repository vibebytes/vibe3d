import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { mergeGroup } from '../src/merge';
import { MAT } from './helpers';

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;
const dataOf = (err: unknown): any => (err as { data?: any } | undefined)?.data;

function node(over: Partial<SceneNode> & Pick<SceneNode, 'id'>): SceneNode {
  return {
    kind: 'mesh',
    name: over.id,
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [2, 2, 2] },
    material: 'm_00000001',
    ...over,
  } as SceneNode;
}

function docOf(...nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('merge');
  for (const n of nodes) doc.nodes[n.id] = n;
  doc.roots = nodes.filter((n) => !n.parent).map((n) => n.id);
  doc.materials['m_00000001'] = structuredClone(MAT);
  doc.materials['m_00000002'] = { ...structuredClone(MAT), baseColor: [1, 0, 0, 1] };
  return doc;
}

const fail = (doc: SceneDoc, opts: Parameters<typeof mergeGroup>[1]): any => {
  try {
    mergeGroup(doc, opts);
  } catch (e) {
    return e;
  }
  throw new Error('expected mergeGroup to throw');
};

const group = (over: Partial<SceneNode> = {}): SceneNode =>
  node({ id: 'n_00000001', kind: 'group', name: '组', ...over } as SceneNode);

describe('mergeGroup', () => {
  it('把两个盒子烘成一个 baked 几何，坐标是组局部空间', () => {
    const doc = docOf(
      group({ transform: { p: [10, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } }),
      node({ id: 'n_00000002', parent: 'n_00000001' }),
      node({
        id: 'n_00000003',
        parent: 'n_00000001',
        transform: { p: [4, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      }),
    );
    const plan = mergeGroup(doc, { nodeId: 'n_00000001' });
    expect(plan.sources).toEqual(['n_00000002', 'n_00000003']);
    expect(plan.positions.length).toBe(2 * 24 * 3);
    expect(plan.normals.length).toBe(plan.positions.length);
    expect(plan.indices.length).toBe(2 * 36);
    expect(plan.tris).toBe(24);
    expect(plan.vertices).toBe(48);
    expect(plan.bbox.min.map((v) => Math.round(v * 100) / 100)).toEqual([-1, -1, -1]);
    expect(plan.bbox.max.map((v) => Math.round(v * 100) / 100)).toEqual([5, 1, 1]);
  });

  it('沿父级与自身旋转烘焙，法线保持单位长度', () => {
    const doc = docOf(
      group(),
      node({
        id: 'n_00000002',
        parent: 'n_00000001',
        geometry: { type: 'box', size: [2, 0.5, 0.5] },
        transform: { p: [0, 0, 0], r: [0, Math.PI / 2, 0], s: [1, 1, 1] },
      }),
    );
    const plan = mergeGroup(doc, { nodeId: 'n_00000001' });
    expect(plan.bbox.min.map((v) => Math.round(v * 100) / 100)).toEqual([-0.25, -0.25, -1]);
    expect(plan.bbox.max.map((v) => Math.round(v * 100) / 100)).toEqual([0.25, 0.25, 1]);
    for (let i = 0; i < plan.normals.length; i += 3) {
      const len = Math.hypot(plan.normals[i]!, plan.normals[i + 1]!, plan.normals[i + 2]!);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('多层嵌套组的子节点也一起烘焙', () => {
    const doc = docOf(
      group(),
      group({
        id: 'n_00000002',
        name: '内层',
        parent: 'n_00000001',
        transform: { p: [0, 2, 0], r: [0, 0, 0], s: [1, 1, 1] },
      }),
      node({ id: 'n_00000003', parent: 'n_00000002' }),
    );
    const plan = mergeGroup(doc, { nodeId: 'n_00000001' });
    expect(plan.sources).toEqual(['n_00000003']);
    expect(plan.bbox.min[1]).toBeCloseTo(1, 6);
    expect(plan.bbox.max[1]).toBeCloseTo(3, 6);
  });

  it('材质不一致拒绝，显式 material 覆盖后放行', () => {
    const doc = docOf(
      group(),
      node({ id: 'n_00000002', parent: 'n_00000001' }),
      node({ id: 'n_00000003', parent: 'n_00000001', material: 'm_00000002' }),
    );
    const err = fail(doc, { nodeId: 'n_00000001' });
    expect(codeOf(err)).toBe('E_UNSUPPORTED');
    expect(dataOf(err).materials.sort()).toEqual(['m_00000001', 'm_00000002']);

    const plan = mergeGroup(doc, { nodeId: 'n_00000001', material: 'm_00000002' });
    expect(plan.material).toBe('m_00000002');
  });

  it('不可烘焙的子孙逐个列出 blockers', () => {
    const doc = docOf(
      group(),
      node({ id: 'n_00000002', parent: 'n_00000001' }),
      node({
        id: 'n_00000003',
        parent: 'n_00000001',
        kind: 'light',
        light: { type: 'directional', color: [1, 1, 1, 1], intensity: 1 },
      } as SceneNode),
      node({
        id: 'n_00000004',
        parent: 'n_00000001',
        kind: 'model',
        sha: 'a'.repeat(64),
      } as SceneNode),
      node({
        id: 'n_00000005',
        parent: 'n_00000001',
        clip: { type: 'spin', speed: 1 },
      } as SceneNode),
      node({
        id: 'n_00000006',
        parent: 'n_00000001',
        decal: { text: '招牌' },
      } as SceneNode),
    );
    const err = fail(doc, { nodeId: 'n_00000001' });
    expect(codeOf(err)).toBe('E_UNSUPPORTED');
    expect(dataOf(err).blockers).toEqual([
      { nodeId: 'n_00000003', reason: 'light' },
      { nodeId: 'n_00000004', reason: 'model' },
      { nodeId: 'n_00000005', reason: 'animation' },
      { nodeId: 'n_00000006', reason: 'decal' },
    ]);
  });

  it('目标不是组、空组、节点不存在分别报错', () => {
    const doc = docOf(node({ id: 'n_00000002', name: '单盒' }), group({ id: 'n_00000003', name: '空组' }));
    expect(codeOf(fail(doc, { nodeId: 'n_zzzzzzzz' }))).toBe('E_NODE_NOT_FOUND');
    expect(codeOf(fail(doc, { nodeId: 'n_00000002' }))).toBe('E_INVALID_PARAMS');
    expect(codeOf(fail(doc, { nodeId: 'n_00000003' }))).toBe('E_INVALID_PARAMS');
  });

  it('baked 输入原样并入且保留分段三角形', () => {
    const tube = {
      type: 'baked' as const,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      bbox: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
    };
    const doc = docOf(group(), node({ id: 'n_00000002', parent: 'n_00000001', geometry: tube }));
    const plan = mergeGroup(doc, { nodeId: 'n_00000001' });
    expect(plan.positions.length).toBe(9);
    expect(plan.indices).toEqual([0, 1, 2]);
    expect(plan.tris).toBe(1);
  });
});
