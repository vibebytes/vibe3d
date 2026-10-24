import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'op id' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.export', { roomId }, roomId);
  return body.result.doc;
}

async function template(h: Harness, roomId: string): Promise<any> {
  const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
  const before = await doc(h, roomId);
  return before.nodes[created.body.result.nodeId];
}

describe('node.create without id', () => {
  it('缺 id 时由服务端补齐，并在 assigned 里回报 index / name / id', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    const node = { ...base, name: '未命名箱子' };
    delete node.id;

    const res = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node }] }, roomId);
    expect(res.body.error).toBeUndefined();
    const assigned = res.body.result.assigned;
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({ index: 0, name: '未命名箱子' });
    expect(assigned[0].id).toMatch(/^n_[a-z0-9]{8}$/);
    expect((await doc(h, roomId)).nodes[assigned[0].id].name).toBe('未命名箱子');
  });

  it('显式 id 原样保留，输出不带 assigned 键', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    const node = { ...base, id: 'n_explicit', name: '显式 id' };

    const res = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node }] }, roomId);
    expect(res.body.error).toBeUndefined();
    expect('assigned' in res.body.result).toBe(false);
    expect((await doc(h, roomId)).nodes.n_explicit.name).toBe('显式 id');
  });

  it('dryRun 同样补齐 id，且 inverse 用的就是这个 id', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    const node = { ...base, name: '预览箱子' };
    delete node.id;
    const count = Object.keys((await doc(h, roomId)).nodes).length;

    const res = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.create', node }], dryRun: true },
      roomId,
    );
    expect(res.body.error).toBeUndefined();
    const id = res.body.result.assigned[0].id;
    expect(res.body.result.inverse[0]).toEqual({ op: 'node.delete', id, cascade: true });
    expect(Object.keys((await doc(h, roomId)).nodes)).toHaveLength(count);
  });

  it('同批多个缺 id 的 create 各拿不同 id，按批次顺序回报', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    const mk = (name: string) => {
      const node = { ...base, name };
      delete node.id;
      return { op: 'node.create', node };
    };

    const res = await call(h, 'ops.apply', { roomId, ops: [mk('左'), mk('右')] }, roomId);
    expect(res.body.error).toBeUndefined();
    const assigned = res.body.result.assigned;
    expect(assigned.map((a: any) => [a.index, a.name])).toEqual([
      [0, '左'],
      [1, '右'],
    ]);
    expect(assigned[0].id).not.toBe(assigned[1].id);
    const after = await doc(h, roomId);
    expect(after.nodes[assigned[0].id].name).toBe('左');
    expect(after.nodes[assigned[1].id].name).toBe('右');
  });
});
