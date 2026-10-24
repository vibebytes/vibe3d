import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { validateScene } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';

function mesh(
  id: string,
  parent: string | null,
  p: [number, number, number],
  size: [number, number, number] = [1, 1, 1],
): SceneNode {
  return {
    id,
    kind: 'mesh',
    name: id,
    parent,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size },
    material: 'm_00000001',
  };
}

function group(
  id: string,
  p: [number, number, number],
  s: [number, number, number],
  children: SceneNode[],
): { parent: SceneNode; children: SceneNode[] } {
  return {
    parent: {
      id,
      kind: 'group',
      name: id,
      parent: null,
      visible: true,
      transform: { p, r: [0, 0, 0], s },
    },
    children: children.map((child) => ({ ...child, parent: id })),
  };
}

function add(doc: SceneDoc, nodes: SceneNode[]): void {
  for (const node of nodes) {
    doc.nodes[node.id] = node;
    if (!node.parent) doc.roots.push(node.id);
  }
}

function codes(doc: SceneDoc): string[] {
  return validateScene(doc, { checks: [], semantics: true }).issues.map((issue) => issue.code).sort();
}

describe('scene.validate semantics audit', () => {
  it('semantics:true 报满四类结构问题', () => {
    const doc = emptyDoc('audit');
    const scaled = group(
      'n_group001',
      [0, 2, 0],
      [0.05, 1, 1],
      [mesh('n_scale001', 'n_group001', [0.5, 0, 0])],
    );
    const mixed = group(
      'n_group002',
      [0, 5, 0],
      [0.5, 0.5, 0.5],
      [mesh('n_mixed001', 'n_group002', [2, 0, 0])],
    );
    const bimodal = group(
      'n_group003',
      [0, 0, 0],
      [1, 1, 1],
      [
        mesh('n_bi00001', 'n_group003', [0.1, 0, 0]),
        mesh('n_bi00002', 'n_group003', [0.2, 0, 0]),
        mesh('n_bi00003', 'n_group003', [10, 0, 0]),
        mesh('n_bi00004', 'n_group003', [20, 0, 0]),
      ],
    );
    add(doc, [scaled.parent, ...scaled.children]);
    add(doc, [mixed.parent, ...mixed.children]);
    add(doc, [bimodal.parent, ...bimodal.children]);
    add(doc, [
      mesh('n_solid001', null, [0, 0, 0], [1, 1, 1]),
      mesh('n_orphan01', 'n_solid001', [5, 0, 0]),
    ]);

    expect(codes(doc)).toEqual(['bimodal-local', 'mixed-semantics', 'orphan-child', 'suspect-scale']);
  });

  it('mixed-semantics 每个异常组只报一条，nodeIds 带组与可疑子节点', () => {
    const doc = emptyDoc('mixed');
    for (let i = 1; i <= 3; i++) {
      const g = group(
        `n_group00${i}`,
        [0, 3 * i, 0],
        [0.5, 0.5, 0.5],
        [
          mesh(`n_mixed00${i}`, `n_group00${i}`, [2, 0, 0]),
          mesh(`n_mixed10${i}`, `n_group00${i}`, [0.2, 0, 0]),
        ],
      );
      add(doc, [g.parent, ...g.children]);
    }

    const issues = validateScene(doc, { checks: [], semantics: true }).issues;
    const mixedIssues = issues.filter((issue) => issue.code === 'mixed-semantics');
    expect(mixedIssues).toHaveLength(3);
    expect(mixedIssues.every((issue) => issue.nodeIds.length === 2)).toBe(true);
    expect(mixedIssues.map((issue) => issue.nodeIds[1]).sort()).toEqual([
      'n_mixed001',
      'n_mixed002',
      'n_mixed003',
    ]);
  });

  it('归一化后语义问题归零', () => {
    const doc = emptyDoc('normalized');
    const normalized = group(
      'n_group001',
      [0, 0, 0],
      [1, 1, 1],
      [
        mesh('n_mixed001', 'n_group001', [2, 0, 0]),
        mesh('n_mixed002', 'n_group001', [3, 0, 0]),
        mesh('n_mixed003', 'n_group001', [4, 0, 0]),
      ],
    );
    add(doc, [normalized.parent, ...normalized.children]);

    expect(codes(doc)).toEqual([]);
  });

  it('orphan-child 不误报 group 下的合法悬空', () => {
    const doc = emptyDoc('hang');
    const hanging = group('n_group001', [0, 0, 0], [1, 1, 1], [
      mesh('n_hang001', 'n_group001', [5, 3, 0]),
    ]);
    add(doc, [hanging.parent, ...hanging.children]);

    expect(codes(doc)).toEqual([]);
  });
});
