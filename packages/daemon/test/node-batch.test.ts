import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function roomWithBoxes(h: Harness, count = 2): Promise<{ roomId: string; ids: string[] }> {
  const { body } = await call(h, 'room.create', { name: '批处理' });
  const roomId = body.result.roomId;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const created = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        name: `斑马线-${i + 1}`,
        shape: 'box',
        size: [1, 1, 1],
        transform: { p: [i * 2, 0, 0] },
      },
      roomId,
    );
    ids.push(created.body.result.nodeId);
  }
  return { roomId, ids };
}

describe('node.transform_many', () => {
  it('按 ids 平移并支持一次撤销', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h);
    const { body } = await call(h, 'node.transform_many', { roomId, ids, translate: [0, 0.5, 0] }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.applied).toBe(2);
    const after = await call(h, 'scene.query', { roomId, kind: 'mesh' }, roomId);
    expect(after.body.result.nodes.map((n: any) => n.worldBbox.min[1])).toEqual([0, 0]);
    await call(h, 'scene.undo', { roomId }, roomId);
    const undone = await call(h, 'scene.query', { roomId, kind: 'mesh' }, roomId);
    expect(undone.body.result.nodes.map((n: any) => n.worldBbox.min[1])).toEqual([-0.5, -0.5]);
  });

  it('按 filter 命中并用 scale 缩放', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(h, 3);
    await call(
      h,
      'node.update',
      {
        roomId,
        nodeId: (await call(h, 'scene.query', { roomId, limit: 1 }, roomId)).body.result.nodes[0].id,
        patch: { name: '树木' },
      },
      roomId,
    );
    const { body } = await call(
      h,
      'node.transform_many',
      { roomId, filter: { name: '树木' }, scale: [2, 2, 2], translate: [0, 1, 0] },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.applied).toBe(1);
    const tree = await call(h, 'scene.query', { roomId, name: '树木' }, roomId);
    expect(tree.body.result.nodes[0].worldBbox).toEqual({ min: [-1, 0, -1], max: [1, 2, 1] });
  });

  it('ids 与 filter 互斥，缺参报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h);
    const both = await call(
      h,
      'node.transform_many',
      { roomId, ids, filter: { kind: 'mesh' }, translate: [0, 1, 0] },
      roomId,
    );
    expect(codeOf(both.body)).toBe('E_INVALID_PARAMS');
    const none = await call(h, 'node.transform_many', { roomId, translate: [0, 1, 0] }, roomId);
    expect(codeOf(none.body)).toBe('E_INVALID_PARAMS');
    const missing = await call(
      h,
      'node.transform_many',
      { roomId, ids: ['n_missing1'], translate: [0, 1, 0] },
      roomId,
    );
    expect(codeOf(missing.body)).toBe('E_NODE_NOT_FOUND');
  });
});

describe('node.array', () => {
  it('沿 offset 复制 count 份，名称自动编号', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h, 1);
    const { body } = await call(h, 'node.array', { roomId, id: ids[0], count: 3, offset: [0, 0, 1] }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.nodeIds).toHaveLength(3);
    const all = await call(h, 'scene.query', { roomId, name: '斑马线-1' }, roomId);
    expect(all.body.result.total).toBe(4);
    const zs = all.body.result.nodes
      .map((n: any) => n.worldBbox.min[2])
      .sort((a: number, b: number) => a - b);
    expect(zs).toEqual([-0.5, 0.5, 1.5, 2.5]);
  });
});

describe('node.group', () => {
  it('按选择框中心建组，keepWorld 保持世界位置', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h);
    const before = await call(h, 'scene.query', { roomId, kind: 'mesh' }, roomId);
    const { body } = await call(h, 'node.group', { roomId, ids, name: '斑马组' }, roomId);
    expect(body.error).toBeUndefined();
    const groupId = body.result.groupId;
    const view = await call(h, 'node.get', { roomId, nodeId: groupId }, roomId);
    expect(view.body.result.name).toBe('斑马组');
    expect(view.body.result.children.sort()).toEqual([...ids].sort());
    expect(view.body.result.worldBbox).toEqual({ min: [-0.5, -0.5, -0.5], max: [2.5, 0.5, 0.5] });
    expect(before.body.result.total).toBe(2);
    await call(h, 'scene.undo', { roomId }, roomId);
    const roots = await call(h, 'scene.query', { roomId, kind: 'mesh' }, roomId);
    expect(roots.body.result.nodes.map((n: any) => n.parentId)).toEqual([null, null]);
  });
});

describe('material.assign', () => {
  it('批量换材质，可撤销', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h);
    const target = await call(h, 'node.get', { roomId, nodeId: ids[1] }, roomId);
    const materialId = target.body.result.materialId;
    const { body } = await call(
      h,
      'material.assign',
      { roomId, filter: { name: '斑马线-1' }, materialId },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.applied).toBe(1);
    const first = await call(h, 'node.get', { roomId, nodeId: ids[0] }, roomId);
    expect(first.body.result.materialId).toBe(materialId);
    expect(first.body.result.material).toBeDefined();
    await call(h, 'scene.undo', { roomId }, roomId);
    const back = await call(h, 'node.get', { roomId, nodeId: ids[0] }, roomId);
    expect(back.body.result.materialId).not.toBe(materialId);
  });
});

describe('旋转增量以度为单位', () => {
  it('transform_many rotate=[0,90,0] 落库为 π/2 弧度', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h);
    const { body } = await call(h, 'node.transform_many', { roomId, ids, rotate: [0, 90, 0] }, roomId);
    expect(body.error).toBeUndefined();
    const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
    for (const id of ids) {
      expect((doc.nodes[id].transform as any).r[1]).toBeCloseTo(Math.PI / 2, 6);
    }
  });

  it('array rotateStep=[0,30,0] 每份递增 30°，落库为弧度', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h, 1);
    const { body } = await call(
      h,
      'node.array',
      { roomId, id: ids[0], count: 2, offset: [2, 0, 0], rotateStep: [0, 30, 0] },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
    const ry = body.result.nodeIds.map((id: string) => (doc.nodes[id].transform as any).r[1]);
    expect(ry[0]).toBeCloseTo(Math.PI / 6, 6);
    expect(ry[1]).toBeCloseTo(Math.PI / 3, 6);
  });
});

describe('node.create items', () => {
  it('20 个带 anchor 与 screenAt 的 items 只增加 1 次 revision，名称唯一', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: '批量建' });
    const roomId = created.result.roomId as string;
    await call(
      h,
      'camera.set',
      { roomId, camera: { mode: 'persp', p: [0, 2, 12], target: [0, 0, 0], fov: 40, zoom: 1 } },
      roomId,
    );
    const before = (await call(h, 'scene.get', { roomId }, roomId)).body.result.revision as number;
    const items = Array.from({ length: 20 }, (_, i) => ({
      kind: 'mesh' as const,
      name: `批-${i}`,
      shape: 'box' as const,
      size: [0.4, 0.8, 0.4] as [number, number, number],
      anchor: 'bottom' as const,
      screenAt: { u: 0.15 + (i % 10) * 0.07, v: 0.4 + Math.floor(i / 10) * 0.2, depth: 8 },
    }));
    const { body } = await call(h, 'node.create', { roomId, kind: 'mesh', items }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.revision).toBe(before + 1);
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const names = Object.values(doc.nodes).map((node: any) => node.name as string);
    expect(names).toHaveLength(20);
    expect(new Set(names).size).toBe(20);
  });

  it('items 与 upsertByName 同传，或超过 200 项，返回 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: '批量拒' });
    const roomId = created.result.roomId as string;
    const item = {
      kind: 'mesh' as const,
      name: 'a',
      shape: 'box' as const,
      size: [1, 1, 1] as [number, number, number],
    };
    const both = await call(
      h,
      'node.create',
      { roomId, items: [item], upsertByName: true, kind: 'mesh' },
      roomId,
    );
    expect(codeOf(both.body)).toBe('E_INVALID_PARAMS');
    const tooMany = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', items: Array.from({ length: 201 }, (_, i) => ({ ...item, name: `n-${i}` })) },
      roomId,
    );
    expect(codeOf(tooMany.body)).toBe('E_INVALID_PARAMS');
  });

  it('ops.apply 里的裸 node.create 不接受 screenAt', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: '裸 op' });
    const roomId = created.result.roomId as string;
    const mat = await call(h, 'material.create', { roomId, preset: 'concrete' }, roomId);
    const { body } = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          {
            op: 'node.create',
            node: {
              kind: 'mesh',
              name: '裸',
              parent: null,
              visible: true,
              geometry: { type: 'box', size: [1, 1, 1] },
              material: mat.body.result.materialId,
              transform: { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] },
              screenAt: { u: 0.2, v: 0.2, depth: 6 },
            },
          },
        ],
      },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const node = Object.values(doc.nodes)[0] as { transform: { p: number[] } };
    expect(node.transform.p).toEqual([1, 2, 3]);
  });

  it('items 里的 from/to 生成斜向连杆', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: '批量连杆' });
    const roomId = created.result.roomId as string;
    const made = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        items: [
          {
            kind: 'mesh',
            name: '连杆',
            shape: 'cylinder',
            radius: 0.1,
            from: [0, 2, 0],
            to: [2, 4, 0],
          },
        ],
      },
      roomId,
    );
    expect(made.body.error).toBeUndefined();
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const node = Object.values(doc.nodes)[0] as {
      geometry: { height: number };
      transform: { p: number[]; r: number[] };
    };
    expect(node.transform.p).toEqual([1, 3, 0]);
    expect(node.geometry.height).toBeCloseTo(Math.hypot(2, 2), 5);
    expect(node.transform.r[2]).toBeCloseTo(-Math.PI / 4, 5);
  });
});
