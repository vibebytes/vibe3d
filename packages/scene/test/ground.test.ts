import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { nodeBounds, validateScene } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT } from './helpers';

function mesh(
  id: `n_${string}`,
  name: string,
  size: [number, number, number],
  p: [number, number, number],
): SceneNode {
  return {
    id,
    kind: 'mesh',
    name,
    parent: null,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size },
    material: 'm_00000001',
  } as SceneNode;
}

function docOf(...nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('ground');
  for (const node of nodes) {
    doc.nodes[node.id] = node;
    doc.roots.push(node.id);
  }
  doc.materials['m_00000001'] = structuredClone(MAT);
  return doc;
}

const floor = (): SceneNode => mesh('n_00000001', '地面', [20, 0.2, 20], [0, -0.1, 0]);
const table = (): SceneNode => mesh('n_00000002', '桌面', [1.4, 0.08, 0.9], [0, 0.72, 0]);
const plate = (): SceneNode => mesh('n_00000003', '盘子', [0.3, 0.03, 0.3], [0, 0.775, 0]);

describe('groundLevel', () => {
  it('桌面放盘子不把桌面当地面：回退 0 并给出 warning', () => {
    const doc = docOf(table(), plate());
    const result = validateScene(doc, { checks: [] });
    expect(result.groundY).toBe(0);
    expect(result.groundEvidence).toBeUndefined();
    expect(result.warning).toBeTruthy();
  });

  it('无地面时返回 0 且带 warning', () => {
    const doc = docOf(mesh('n_00000004', '箱子', [1, 1, 1], [0, 3, 0]));
    const result = validateScene(doc, { checks: [] });
    expect(result.groundY).toBe(0);
    expect(result.warning).toMatch(/地面/);
  });

  it('地面与桌面共存时取面积最大的底层水平面', () => {
    const doc = docOf(floor(), table(), plate());
    const result = validateScene(doc, { checks: [] });
    expect(result.groundY).toBe(0);
    expect(result.warning).toBeUndefined();
    expect(result.groundEvidence?.nodeId).toBe('n_00000001');
    const box = nodeBounds(doc, 'n_00000001')!;
    const area = (box.max[0] - box.min[0]) * (box.max[2] - box.min[2]);
    expect(result.groundEvidence?.area).toBeCloseTo(area, 6);
    expect(result.groundEvidence?.top).toBeCloseTo(0, 6);
  });

  it('抬高的平台不与地面争：离底部 25% 高度带外的不参与', () => {
    const doc = docOf(
      floor(),
      mesh('n_00000005', '高台', [6, 0.1, 6], [0, 1.2, 0]),
      mesh('n_00000006', '塔', [1, 4, 1], [0, 3, 0]),
    );
    const result = validateScene(doc, { checks: [] });
    expect(result.groundY).toBe(0);
    expect(result.groundEvidence?.nodeId).toBe('n_00000001');
  });

  it('显式 groundY 优先于推断', () => {
    const doc = docOf(floor(), mesh('n_00000007', '箱子', [1, 1, 1], [0, 0.5, 0]));
    const result = validateScene(doc, { checks: [], groundY: 1.5 });
    expect(result.groundY).toBe(1.5);
    expect(result.warning).toBeUndefined();
    expect(result.groundEvidence?.source).toBe('explicit');
  });
});
