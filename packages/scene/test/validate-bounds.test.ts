import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { validateScene } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT } from './helpers';

function cube(id: `n_${string}`, p: [number, number, number], parent: `n_${string}` | null = null): SceneNode {
  return {
    id,
    kind: 'mesh',
    name: id,
    parent,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [1, 1, 1] },
    material: 'm_00000001',
  };
}

function doc(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('test');
  for (const node of nodes) doc.nodes[node.id] = node;
  doc.roots = nodes.filter((n) => !n.parent).map((n) => n.id);
  doc.materials['m_00000001'] = structuredClone(MAT);
  return doc;
}

const boundsOf = (doc: SceneDoc, code: string) =>
  validateScene(doc).issues.find((issue) => issue.code === code)?.bounds;

describe('scene.validate issue bounds', () => {
  it('floating issue 携带节点世界包围盒', () => {
    const d = doc([cube('n_00000001', [0, 1.5, 0])]);
    expect(boundsOf(d, 'floating')).toEqual({ min: [-0.5, 1, -0.5], max: [0.5, 2, 0.5] });
  });

  it('intersect issue 携带两节点包围盒并集', () => {
    const d = doc([cube('n_00000001', [0, 0.5, 0]), cube('n_00000002', [0.4, 0.5, 0])]);
    expect(boundsOf(d, 'intersect')).toEqual({ min: [-0.5, 0, -0.5], max: [0.9, 1, 0.5] });
  });

  it('orphan-child issue 携带父子的包围盒并集', () => {
    const d = doc([cube('n_00000001', [0, 0.5, 0]), cube('n_00000002', [5, 0.5, 0], 'n_00000001')]);
    expect(boundsOf(d, 'orphan-child')).toEqual({ min: [-0.5, 0, -0.5], max: [5.5, 1, 5.5] });
  });

  it('语义类 issue 也带 bounds（取涉及节点并集，取不到时省略）', () => {
    const group: SceneNode = {
      id: 'n_00000001',
      kind: 'group',
      name: 'g',
      parent: null,
      visible: true,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [0.1, 0.1, 0.1] },
    };
    const d = doc([group, cube('n_00000002', [3, 0, 0], 'n_00000001')]);
    const result = validateScene(d, { semantics: true });
    const suspect = result.issues.find((issue) => issue.code === 'suspect-scale');
    expect(suspect?.bounds).toBeDefined();
    expect(suspect?.bounds?.max[0]).toBeCloseTo(0.35, 5);
  });
});
