import { describe, expect, it } from 'vitest';
import { type Harness, call, codeOf, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'op name' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.export', { roomId }, roomId);
  return body.result.doc;
}

async function makeNamed(h: Harness, roomId: string, name: string): Promise<string> {
  const { body } = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', name }, roomId);
  return body.result.nodeId;
}

describe('@name references in ops', () => {
  it('node.update 用 @name 指向已有节点，resolved 回报映射', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const id = await makeNamed(h, roomId, '桌腿');

    const res = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id: '@桌腿', patch: { name: '桌腿-2' } }] },
      roomId,
    );
    expect(codeOf(res.body)).toBeUndefined();
    expect(res.body.result.resolved).toEqual({ '@桌腿': id });
    expect((await doc(h, roomId)).nodes[id].name).toBe('桌腿-2');
  });

  it('node.create 的 parent 可以用 @name', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const parentId = await makeNamed(h, roomId, '底座');
    const base = (await doc(h, roomId)).nodes[parentId];
    const child = { ...base, id: 'n_childbtn', name: '底座上的块', parent: '@底座' };

    const res = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node: child }] }, roomId);
    expect(codeOf(res.body)).toBeUndefined();
    expect(res.body.result.resolved).toEqual({ '@底座': parentId });
    expect((await doc(h, roomId)).nodes.n_childbtn.parent).toBe(parentId);
  });

  it('同批先 create 再按 @name 引用，指向服务端补的 id', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const templateId = await makeNamed(h, roomId, '模板');
    const base = (await doc(h, roomId)).nodes[templateId];
    const fresh = { ...base, name: '新块' };
    delete fresh.id;

    const res = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          { op: 'node.create', node: fresh },
          { op: 'node.update', id: '@新块', patch: { visible: false } },
        ],
      },
      roomId,
    );
    expect(res.body.error).toBeUndefined();
    const id = res.body.result.assigned[0].id;
    expect(res.body.result.resolved).toEqual({ '@新块': id });
    expect((await doc(h, roomId)).nodes[id].visible).toBe(false);
  });

  it('名字不存在时 E_NODE_NOT_FOUND，且不落库', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const id = await makeNamed(h, roomId, '甲');
    const before = (await doc(h, roomId)).revision;

    const res = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id: '@乙', patch: { name: '找不到' } }] },
      roomId,
    );
    expect(codeOf(res.body)).toBe('E_NODE_NOT_FOUND');
    expect(res.body.error.message).toContain('乙');
    expect((await doc(h, roomId)).revision).toBe(before);
    expect((await doc(h, roomId)).nodes[id].name).toBe('甲');
  });

  it('重名时 E_INVALID_PARAMS 且提示改用 id', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await makeNamed(h, roomId, '同名');
    await makeNamed(h, roomId, '同名');

    const res = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.delete', id: '@同名' }] }, roomId);
    expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');
    expect(res.body.error.message).toContain('同名');
  });

  it('同批先 create 再用 @name 做 animation.define / pose / clear 与 fx.create', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const templateId = await makeNamed(h, roomId, '模板');
    const base = (await doc(h, roomId)).nodes[templateId];
    const hip = { ...base, name: 'hip' };
    delete hip.id;
    const sway = { type: 'sway', amplitude: 0.2, frequency: 1 };

    const res = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          { op: 'node.create', node: hip },
          { op: 'animation.define', target: '@hip', clip: sway },
          { op: 'animation.pose', targets: [{ nodeId: '@模板', clip: { type: 'spin', frequency: 1 } }] },
          { op: 'animation.clear', target: '@模板' },
          { op: 'fx.create', fx: { id: 'f_hipdust1', type: 'particles', nodeId: '@hip' } },
        ],
      },
      roomId,
    );
    expect(res.body.error).toBeUndefined();
    const id = res.body.result.assigned[0].id;
    expect(res.body.result.resolved).toEqual({ '@hip': id, '@模板': templateId });
    const after = await doc(h, roomId);
    expect(after.nodes[id].clips?.[0] ?? after.nodes[id].clip).toMatchObject({ type: 'sway' });
    expect(after.nodes[templateId].clips ?? []).toEqual([]);
    expect(after.fx.find((f: { id: string }) => f.id === 'f_hipdust1').nodeId).toBe(id);
  });

  it('animation.play / stop 的 target 也接受 @name', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    await makeNamed(h, roomId, '摆件');

    const res = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          { op: 'animation.define', target: '@摆件', clip: { type: 'spin', frequency: 1 } },
          { op: 'animation.play', target: '@摆件' },
          { op: 'animation.stop', target: '@摆件' },
        ],
      },
      roomId,
    );
    expect(res.body.error).toBeUndefined();
  });

  it('未解析的 @ 引用直达 reducer 时报错而不是当作 id', async () => {
    const { applyOps } = await import('@vibebyte/vibe3d-scene');
    const h = makeHarness();
    const roomId = await room(h);
    const before = await doc(h, roomId);
    expect(() =>
      applyOps(before, [{ op: 'animation.define', target: '@悬空', clip: { type: 'spin' } } as never]),
    ).toThrow(/未解析.*@悬空/);
  });

  it('批次里没有 @ 时不产生 resolved 键', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const id = await makeNamed(h, roomId, '丙');

    const res = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id, patch: { visible: false } }] },
      roomId,
    );
    expect(codeOf(res.body)).toBeUndefined();
    expect('resolved' in res.body.result).toBe(false);
  });
});
