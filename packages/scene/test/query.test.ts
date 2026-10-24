import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { nodeView, queryNodes } from '../src/query';

const MAT = 'm_00000001';
const MAT2 = 'm_00000002';

function box(
  id: `n_${string}`,
  name: string,
  p: [number, number, number],
  opts: { size?: [number, number, number]; material?: string; parent?: `n_${string}` } = {},
): SceneNode {
  return {
    id,
    kind: 'mesh',
    name,
    parent: opts.parent ?? null,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: opts.size ?? [1, 1, 1] },
    material: opts.material ?? MAT,
  };
}

function hanging(id: `n_${string}`, name: string, p: [number, number, number]): SceneNode {
  return box(id, name, p, { size: [0.2, 0.2, 0.2] });
}

function light(id: `n_${string}`, name: string, p: [number, number, number]): SceneNode {
  return {
    id,
    kind: 'light',
    name,
    parent: null,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    light: { type: 'point', color: [1, 1, 1, 1], intensity: 2, position: [0, 0, 0] },
  };
}

function model(id: `n_${string}`, name: string, p: [number, number, number]): SceneNode {
  const sha = 'a'.repeat(64);
  return {
    id,
    kind: 'model',
    name,
    parent: null,
    visible: true,
    transform: { p, r: [0, 0, 0], s: [1, 1, 1] },
    sha,
    anim: { playing: false, speed: 1 },
  } as SceneNode;
}

function scene(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('query-test');
  for (const node of nodes) doc.nodes[node.id] = node;
  doc.roots = nodes.filter((n) => n.parent === null).map((n) => n.id);
  doc.materials[MAT] = {
    baseColor: [0.8, 0.8, 0.8, 1],
    metalness: 0.1,
    roughness: 0.6,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  };
  doc.materials[MAT2] = { ...doc.materials[MAT]!, metalness: 0.4 };
  return doc;
}

function zebraRoad(): SceneDoc {
  const nodes: SceneNode[] = [];
  for (let i = 0; i < 20; i++) {
    const id = `n_zebra${String(i).padStart(3, '0')}` as `n_${string}`;
    nodes.push(box(id, `斑马线-${String(i + 1).padStart(2, '0')}`, [i * 1.5, 0.11, 0], { size: [1.2, 0.02, 0.6] }));
  }
  nodes.push(hanging('n_lamp001', '路灯-01', [0, 1, 0]));
  nodes.push(hanging('n_lamp002', '路灯-02', [5, 1, 0]));
  nodes.push(box('n_wall001', '墙体', [0, 2, -4], { size: [30, 4, 0.4], material: MAT2 }));
  nodes.push(model('n_train001', '小火车', [0, 0.2, 3]));
  nodes.push(light('n_light001', '主灯', [0, 5, 0]));
  return scene(nodes);
}

describe('queryNodes', () => {
  it('按名称模糊匹配，大小写不敏感', () => {
    const doc = scene([
      box('n_a0000001', 'Bush_A', [0, 0, 0]),
      box('n_a0000002', 'bush_b', [1, 0, 0]),
      box('n_a0000003', 'Tree', [2, 0, 0]),
    ]);
    const hit = queryNodes(doc, { name: 'bush' });
    expect(hit.total).toBe(2);
    expect(hit.nodes.map((n) => n.id).sort()).toEqual(['n_a0000001', 'n_a0000002']);
  });

  it('按 kind / materialId 过滤', () => {
    const doc = zebraRoad();
    expect(queryNodes(doc, { name: '斑马' }).total).toBe(20);
    const lamps = queryNodes(doc, { kind: 'light' });
    expect(lamps.total).toBe(1);
    expect(lamps.nodes.every((n) => n.kind === 'light')).toBe(true);
    const wall = queryNodes(doc, { materialId: MAT2 });
    expect(wall.nodes.map((n) => n.name)).toEqual(['墙体']);
  });

  it('minY 抓悬空节点：世界包围盒底 ≥ 阈值', () => {
    const doc = zebraRoad();
    const hanging = queryNodes(doc, { minY: 0.9 });
    expect(hanging.nodes.map((n) => n.id)).toEqual(['n_lamp001', 'n_lamp002']);
    const grounded = queryNodes(doc, { maxY: 0.5 });
    expect(grounded.nodes.every((n) => (n.worldBbox?.max[1] ?? 1) <= 0.5)).toBe(true);
    expect(grounded.total).toBe(20);
  });

  it('bbox 过滤命中世界包围盒相交的节点', () => {
    const doc = zebraRoad();
    const hit = queryNodes(doc, { bbox: { min: [0, 0, -1], max: [3, 0.5, 1] } });
    expect(hit.total).toBe(3);
    expect(hit.nodes.map((n) => n.id)).toEqual(['n_zebra000', 'n_zebra001', 'n_zebra002']);
  });

  it('分页：limit + cursor，total 恒定且无重复', () => {
    const doc = zebraRoad();
    const seen: string[] = [];
    let cursor: number | undefined = 0;
    let pages = 0;
    let total = -1;
    while (cursor !== undefined) {
      const page = queryNodes(doc, { name: '斑马', limit: 7, cursor });
      total = page.total;
      seen.push(...page.nodes.map((n) => n.id));
      cursor = page.next;
      pages += 1;
    }
    expect(pages).toBe(3);
    expect(total).toBe(20);
    expect(new Set(seen).size).toBe(20);
  });

  it('hasAnim 只命中带动画的模型节点', () => {
    const doc = zebraRoad();
    expect(queryNodes(doc, { hasAnim: true }).nodes.map((n) => n.id)).toEqual(['n_train001']);
    expect(queryNodes(doc, { hasAnim: false }).total).toBe(24);
  });

  it('visible=false 的节点仍可被查到，但 worldBbox 为 null', () => {
    const doc = zebraRoad();
    doc.nodes.n_lamp001!.visible = false;
    const hit = queryNodes(doc, { name: '路灯-01' });
    expect(hit.nodes[0]?.visible).toBe(false);
    expect(hit.nodes[0]?.worldBbox).toBeNull();
  });

  it('过滤结果按名称稳定排序，limit 默认 50 且上限 500', () => {
    const doc = zebraRoad();
    const all = queryNodes(doc, {});
    expect(all.total).toBe(25);
    expect(all.nodes[0]?.name).toBe('主灯');
    expect(queryNodes(doc, { limit: 9999 }).nodes.length).toBe(25);
  });
});

describe('nodeView', () => {
  it('返回世界包围盒、材质、父子关系与子节点列表', () => {
    const doc = zebraRoad();
    const view = nodeView(doc, 'n_wall001')!;
    expect(view.name).toBe('墙体');
    expect(view.parentId).toBeNull();
    expect(view.worldBbox).toEqual({ min: [-15, 0, -4.2], max: [15, 4, -3.8] });
    expect(view.materialId).toBe(MAT2);
    expect(view.material?.metalness).toBeTypeOf('number');
    expect(view.children).toEqual([]);
  });

  it('组节点汇总子节点世界范围并列出 children', () => {
    const doc = scene([
      box('n_g0000001', '组', [10, 0, 0]),
      box('n_c0000001', '子A', [0, 0, 0], { parent: 'n_g0000001' }),
      box('n_c0000002', '子B', [2, 0, 0], { parent: 'n_g0000001' }),
    ]);
    const view = nodeView(doc, 'n_g0000001')!;
    expect(view.children.sort()).toEqual(['n_c0000001', 'n_c0000002']);
    expect(view.worldBbox).toEqual({ min: [9.5, -0.5, -0.5], max: [12.5, 0.5, 0.5] });
  });

  it('节点不存在返回 null', () => {
    expect(nodeView(scene([]), 'n_missing1')).toBeNull();
  });
});
