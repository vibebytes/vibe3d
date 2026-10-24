import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const group = (id: string, x: number) => ({
  op: 'node.create',
  node: {
    id,
    name: id,
    parent: null,
    visible: true,
    transform: { p: [x, 1, 0], r: [0, 0, 0], s: [1, 1, 1] },
    kind: 'group',
  },
});

async function threeSteps(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '分步撤销' });
  const roomId = body.result.roomId;
  await call(h, 'ops.apply', { roomId, ops: [group('n_aaaaaaaa', 0)], opId: 'step-a' }, roomId);
  await call(
    h,
    'ops.apply',
    {
      roomId,
      ops: [
        {
          op: 'node.update',
          id: 'n_aaaaaaaa',
          patch: { transform: { p: [3, 1, 0], r: [0, 0, 0], s: [1, 1, 1] } },
        },
      ],
      opId: 'step-b',
    },
    roomId,
  );
  await call(h, 'ops.apply', { roomId, ops: [group('n_bbbbbbbb', 5)], opId: 'step-c' }, roomId);
  return roomId;
}

describe('scene.undo 按 opId 定点撤销', () => {
  it('只回滚指定那一步，后续步仍在', async () => {
    const h = makeHarness();
    const roomId = await threeSteps(h);
    const before = await call(h, 'scene.export', { roomId }, roomId);
    expect(before.body.result.doc.nodes.n_aaaaaaaa.transform.p[0]).toBe(3);

    const undone = await call(h, 'scene.undo', { roomId, opId: 'step-b' }, roomId);
    expect(undone.body.error).toBeUndefined();
    expect(undone.body.result.revision).toBe(before.body.result.revision + 1);

    const after = await call(h, 'scene.export', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes).sort()).toEqual(['n_aaaaaaaa', 'n_bbbbbbbb']);
    expect(after.body.result.doc.nodes.n_aaaaaaaa.transform.p[0]).toBe(0);
  });

  it('不带 opId 时仍整步撤销', async () => {
    const h = makeHarness();
    const roomId = await threeSteps(h);
    const undone = await call(h, 'scene.undo', { roomId }, roomId);
    expect(undone.body.error).toBeUndefined();
    const after = await call(h, 'scene.export', { roomId }, roomId);
    expect(Object.keys(after.body.result.doc.nodes)).toEqual(['n_aaaaaaaa']);
  });

  it('未知 opId 返回 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await threeSteps(h);
    const missing = await call(h, 'scene.undo', { roomId, opId: 'nope' }, roomId);
    expect(codeOf(missing.body)).toBe('E_INVALID_PARAMS');
  });
});
