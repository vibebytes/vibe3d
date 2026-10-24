import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'rs' });
  return body.result.roomId;
}

async function create(h: Harness, roomId: string, body: Record<string, unknown>): Promise<string> {
  const res = await call(h, 'node.create', { roomId, ...body }, roomId);
  return res.body.result.nodeId;
}

async function checkpoint(h: Harness, roomId: string): Promise<string> {
  const res = await call(h, 'scene.checkpoint', { roomId, name: 'base' }, roomId);
  return res.body.result.checkpointId;
}

describe('scene.restore scope/subtree', () => {
  it('缺省 scope=room 仍整份回灌', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    await create(h, roomId, { kind: 'mesh', shape: 'box' });
    const checkpointId = await checkpoint(h, roomId);
    await create(h, roomId, { kind: 'mesh', shape: 'sphere' });

    const res = await call(h, 'scene.restore', { roomId, checkpointId }, roomId);
    expect(res.status).toBe(200);
    expect(res.body.result.scope).toBe('room');
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(Object.keys(doc.nodes)).toHaveLength(1);
  });

  it('scope=subtree 只回灌目标子树，兄弟节点保留当前值', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    const a = await create(h, roomId, { kind: 'group', name: 'A' });
    const child = await create(h, roomId, { kind: 'mesh', shape: 'box', parent: a });
    const b = await create(h, roomId, { kind: 'group', name: 'B' });
    const checkpointId = await checkpoint(h, roomId);

    await call(h, 'node.update', { roomId, nodeId: child, patch: { transform: { p: [9, 0, 0] } } }, roomId);
    await call(h, 'node.update', { roomId, nodeId: b, patch: { name: 'B2' } }, roomId);
    const extra = await create(h, roomId, { kind: 'mesh', shape: 'sphere' });

    const res = await call(h, 'scene.restore', { roomId, checkpointId, scope: 'subtree', ids: [a] }, roomId);
    expect(res.status).toBe(200);
    expect(res.body.result.scope).toBe('subtree');
    expect(res.body.result.restored).toEqual([a]);

    const restoredChild = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc.nodes[child];
    expect(restoredChild.transform.p).toEqual([0, 0, 0]);
    const kept = (await call(h, 'node.get', { roomId, nodeId: b }, roomId)).body.result;
    expect(kept.name).toBe('B2');
    const keptExtra = await call(h, 'node.get', { roomId, nodeId: extra }, roomId);
    expect(keptExtra.status).toBe(200);
  });

  it('快照里有、当前被删掉的子孙节点随回灌回来', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    const a = await create(h, roomId, { kind: 'group' });
    const child = await create(h, roomId, { kind: 'mesh', shape: 'box', parent: a });
    const checkpointId = await checkpoint(h, roomId);
    await call(h, 'node.delete', { roomId, nodeId: child, cascade: true }, roomId);

    const res = await call(h, 'scene.restore', { roomId, checkpointId, scope: 'subtree', ids: [a] }, roomId);
    expect(res.status).toBe(200);
    const back = (await call(h, 'node.get', { roomId, nodeId: child }, roomId)).body.result;
    expect(back.parentId).toBe(a);
  });

  it('当前被删掉的根节点按快照父级重建', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    const parent = await create(h, roomId, { kind: 'group' });
    const sub = await create(h, roomId, { kind: 'group', parent });
    await create(h, roomId, { kind: 'mesh', shape: 'box', parent: sub });
    const checkpointId = await checkpoint(h, roomId);
    await call(h, 'node.delete', { roomId, nodeId: sub, cascade: true }, roomId);

    const res = await call(
      h,
      'scene.restore',
      { roomId, checkpointId, scope: 'subtree', ids: [sub] },
      roomId,
    );
    expect(res.status).toBe(200);
    expect(res.body.result.added).toEqual([sub]);
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(doc.nodes[sub].parent).toBe(parent);
    expect(Object.keys(doc.nodes)).toHaveLength(3);
  });

  it('ids 含未知节点报 E_NODE_NOT_FOUND 且不落库', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    const a = await create(h, roomId, { kind: 'group' });
    const checkpointId = await checkpoint(h, roomId);
    const before = (await call(h, 'scene.get', { roomId }, roomId)).body.result.revision;

    const res = await call(
      h,
      'scene.restore',
      { roomId, checkpointId, scope: 'subtree', ids: [a, 'n_00000000'] },
      roomId,
    );
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe('E_NODE_NOT_FOUND');
    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.revision;
    expect(after).toBe(before);
  });

  it('scope=subtree 缺 ids 或空数组报 E_INVALID_PARAMS', async () => {
    const h = makeHarness({ persist: true });
    const roomId = await room(h);
    await create(h, roomId, { kind: 'group' });
    const checkpointId = await checkpoint(h, roomId);

    for (const ids of [undefined, []]) {
      const res = await call(h, 'scene.restore', { roomId, checkpointId, scope: 'subtree', ids }, roomId);
      expect(res.status).toBe(400);
      expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');
    }
  });
});
