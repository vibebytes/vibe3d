import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const group = (id: string) => ({
  op: 'node.create',
  node: {
    id,
    name: id,
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    kind: 'group',
  },
});

async function seeded(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '可视化差异' });
  const roomId = body.result.roomId;
  await call(h, 'ops.apply', { roomId, ops: [group('n_11111111'), group('n_22222222')] }, roomId);
  await call(
    h,
    'ops.apply',
    { roomId, ops: [{ op: 'node.update', id: 'n_11111111', patch: { visible: false } }] },
    roomId,
  );
  return roomId;
}

describe('scene.diff visual', () => {
  it('visual:true 时给出新增/更新/删除的节点集合，与 ops 一致', async () => {
    const h = makeHarness();
    const roomId = await seeded(h);
    const diff = await call(h, 'scene.diff', { roomId, from: 0, visual: true }, roomId);
    expect(diff.body.error).toBeUndefined();
    expect(diff.body.result.nodes).toEqual({
      added: ['n_11111111', 'n_22222222'],
      updated: ['n_11111111'],
      removed: [],
    });
    expect(diff.body.result.ops.length).toBe(3);
  });

  it('visual 缺省时不返回节点集', async () => {
    const h = makeHarness();
    const roomId = await seeded(h);
    const diff = await call(h, 'scene.diff', { roomId, from: 0 }, roomId);
    expect(diff.body.error).toBeUndefined();
    expect(diff.body.result.nodes).toBeUndefined();
  });

  it('删除步出现在 removed 里', async () => {
    const h = makeHarness();
    const roomId = await seeded(h);
    await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.delete', id: 'n_22222222', cascade: true }] },
      roomId,
    );
    const diff = await call(h, 'scene.diff', { roomId, from: 2, visual: true }, roomId);
    expect(diff.body.result.nodes).toEqual({ added: [], updated: [], removed: ['n_22222222'] });
  });
});
