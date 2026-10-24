import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { queryNodes } from '../src/query';

const MAT = 'm_00000001';

function node(
  id: `n_${string}`,
  name: string,
  p: [number, number, number],
  opts: { size?: [number, number, number]; parent?: `n_${string}`; kind?: 'mesh' | 'group' } = {},
): SceneNode {
  const base = {
    id,
    name,
    parent: opts.parent ?? null,
    visible: true,
    transform: { p, r: [0, 0, 0] as [number, number, number], s: [1, 1, 1] as [number, number, number] },
  };
  if (opts.kind === 'group') return { ...base, kind: 'group' } as SceneNode;
  return {
    ...base,
    kind: 'mesh',
    geometry: { type: 'box', size: opts.size ?? [1, 1, 1] },
    material: MAT,
  } as SceneNode;
}

function scene(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('relational');
  for (const item of nodes) doc.nodes[item.id] = item;
  doc.roots = nodes.filter((n) => !n.parent).map((n) => n.id);
  doc.materials[MAT] = {
    baseColor: [0.8, 0.8, 0.8, 1],
    metalness: 0.1,
    roughness: 0.6,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  };
  return doc;
}

function fixture(): SceneDoc {
  return scene([
    node('n_root0001', 'root', [0, 0, 0], { kind: 'group' }),
    node('n_child001', 'child-a', [0, 0.5, 0], { parent: 'n_root0001' }),
    node('n_child002', 'child-b', [5, 0.5, 0], { parent: 'n_root0001' }),
    node('n_grand001', 'grand', [0, 1, 0], { parent: 'n_child001', size: [0.2, 0.2, 0.2] }),
    node('n_loose001', 'loose', [20, 0.5, 0]),
  ]);
}

const ids = (doc: SceneDoc, filter: Parameters<typeof queryNodes>[1]): string[] =>
  queryNodes(doc, filter).nodes.map((item) => item.id).sort();

describe('J3 query 关系过滤', () => {
  it('parentId 只取直接子节点', () => {
    expect(ids(fixture(), { parentId: 'n_root0001' })).toEqual(['n_child001', 'n_child002']);
  });

  it('parentId: null 取根节点', () => {
    expect(ids(fixture(), { parentId: null })).toEqual(['n_loose001', 'n_root0001']);
  });

  it('hasChildren 区分枝与叶', () => {
    const doc = fixture();
    expect(ids(doc, { hasChildren: true })).toEqual(['n_child001', 'n_root0001']);
    expect(ids(doc, { hasChildren: false })).toEqual(['n_child002', 'n_grand001', 'n_loose001']);
  });

  it('withinBBox 是包含语义，与 bbox 的相交语义不同', () => {
    const doc = fixture();
    const window = {
      min: [4.9, 0, -1] as [number, number, number],
      max: [5.1, 1, 1] as [number, number, number],
    };
    expect(ids(doc, { bbox: window })).toContain('n_child002');
    expect(ids(doc, { withinBBox: window })).toEqual([]);
    const around = { min: [-1, 0, -1] as [number, number, number], max: [1, 2, 1] as [number, number, number] };
    expect(ids(doc, { withinBBox: around })).toEqual(['n_child001', 'n_grand001']);
  });

  it('关系过滤可与 tags / kind 组合', () => {
    const doc = fixture();
    doc.nodes.n_child002!.tags = ['hero'];
    expect(ids(doc, { parentId: 'n_root0001', tags: ['hero'] })).toEqual(['n_child002']);
    expect(ids(doc, { hasChildren: false, kind: 'mesh' })).toEqual([
      'n_child002',
      'n_grand001',
      'n_loose001',
    ]);
  });
});
