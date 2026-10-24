import { describe, expect, it } from 'vitest';
import { worldMatrix } from '@vibebyte/vibe3d-scene';
import { type Harness, call, makeHarness } from './helpers/harness';

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(1e-6));
};

const origin = (m: number[]) => [m[12]!, m[13]!, m[14]!];

async function scene(h: Harness, roomId: string) {
  return (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
}

async function fixture(h: Harness) {
  const created = await call(h, 'room.create', { name: '改挂父级' });
  const roomId = created.body.result.roomId;
  const from = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'group',
      name: '旧父级',
      transform: { p: [1, 2, 0], r: [0, 0.7, 0], s: [1.5, 1.5, 1.5] },
    },
    roomId,
  );
  const fromId = from.body.result.nodeId;
  const to = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'group',
      name: '新父级',
      transform: { p: [-3, 0.5, 2], r: [0.3, -0.4, 0.9], s: [0.5, 0.5, 0.5] },
    },
    roomId,
  );
  const toId = to.body.result.nodeId;
  const squash = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'group',
      name: '非均匀父级',
      transform: { p: [2, -1, 0.5], r: [0.1, 0.2, -0.2], s: [0.5, 3, 1.5] },
    },
    roomId,
  );
  const squashId = squash.body.result.nodeId;
  const mesh = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      shape: 'box',
      parent: fromId,
      transform: { p: [1.5, -0.5, 2], r: [0.2, 0.1, -0.3], s: [1, 1, 1] },
    },
    roomId,
  );
  return { roomId, fromId, toId, squashId, id: mesh.body.result.nodeId };
}

describe('node.reparent：默认保持世界坐标', () => {
  it('换父级后世界矩阵逐元素不变', async () => {
    const h = makeHarness();
    const { roomId, toId, id } = await fixture(h);
    const before = await scene(h, roomId);
    const moved = await call(h, 'node.reparent', { roomId, id, parent: toId }, roomId);
    expect(moved.body.error).toBeUndefined();
    const after = await scene(h, roomId);
    expect(after.nodes[id]?.parent).toBe(toId);
    near(worldMatrix(after, id)!, worldMatrix(before, id)!);
  });

  it('非均匀缩放父级下世界位置严格保持', async () => {
    const h = makeHarness();
    const { roomId, squashId, id } = await fixture(h);
    const before = await scene(h, roomId);
    await call(h, 'node.reparent', { roomId, id, parent: squashId }, roomId);
    const after = await scene(h, roomId);
    near(origin(worldMatrix(after, id)!), origin(worldMatrix(before, id)!));
  });

  it('keepWorld:false 保留 local TRS，只换父级', async () => {
    const h = makeHarness();
    const { roomId, toId, id } = await fixture(h);
    const before = await scene(h, roomId);
    await call(h, 'node.reparent', { roomId, id, parent: toId, keepWorld: false }, roomId);
    const after = await scene(h, roomId);
    expect(after.nodes[id]?.transform).toEqual(before.nodes[id]?.transform);
    expect(after.nodes[id]?.parent).toBe(toId);
  });

  it('parent:null 回到根节点，世界位置不变', async () => {
    const h = makeHarness();
    const { roomId, id } = await fixture(h);
    const before = await scene(h, roomId);
    const moved = await call(h, 'node.reparent', { roomId, id, parent: null }, roomId);
    expect(moved.body.error).toBeUndefined();
    const after = await scene(h, roomId);
    expect(after.nodes[id]?.parent).toBeNull();
    near(worldMatrix(after, id)!, worldMatrix(before, id)!);
  });

  it('移入自己的子树被拒，且 revision 不变', async () => {
    const h = makeHarness();
    const { roomId, fromId, id } = await fixture(h);
    const before = await scene(h, roomId);
    const failed = await call(h, 'node.reparent', { roomId, id, parent: id }, roomId);
    expect(failed.body.error?.data?.code ?? failed.body.error?.code).toBe('E_INVALID_PARAMS');
    const after = await scene(h, roomId);
    expect(after.revision).toBe(before.revision);
    expect(after.nodes[id]?.parent).toBe(fromId);
  });

  it('目标父级不存在报 E_NODE_NOT_FOUND', async () => {
    const h = makeHarness();
    const { roomId, id } = await fixture(h);
    const failed = await call(h, 'node.reparent', { roomId, id, parent: 'n_deadbeef' }, roomId);
    expect(failed.body.error?.data?.code ?? failed.body.error?.code).toBe('E_NODE_NOT_FOUND');
  });
});
