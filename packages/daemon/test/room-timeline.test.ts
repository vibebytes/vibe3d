import { afterEach, describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const ENV = 'VIBE3D_AUTHOR';
const prev = process.env[ENV];
const setAuthor = (value: string | undefined): void => {
  if (value === undefined) Reflect.deleteProperty(process.env, ENV);
  else process.env[ENV] = value;
};

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'timeline' });
  return body.result.roomId;
}

async function template(h: Harness, roomId: string): Promise<any> {
  const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
  const { body } = await call(h, 'scene.export', { roomId }, roomId);
  return body.result.doc.nodes[created.body.result.nodeId];
}

afterEach(() => setAuthor(prev));

describe('room.timeline op 时间线', () => {
  it('按 revision 倒序给出 opId/摘要/作者/步数', async () => {
    setAuthor('tester');
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);

    await call(
      h,
      'ops.apply',
      {
        roomId,
        opId: 'op_a',
        ops: [
          { op: 'node.create', node: { ...base, id: 'n_t111aaa1', name: '一' } },
          { op: 'node.create', node: { ...base, id: 'n_t211aaa1', name: '二' } },
        ],
      },
      roomId,
    );
    await call(
      h,
      'ops.apply',
      { roomId, opId: 'op_b', ops: [{ op: 'node.update', id: 'n_t111aaa1', patch: { name: '改名的箱子' } }] },
      roomId,
    );

    const res = await call(h, 'room.timeline', { roomId }, roomId);
    expect(res.body.error).toBeUndefined();
    const { revision, entries } = res.body.result;
    expect(revision).toBeGreaterThanOrEqual(3);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries[0].opId).toBe('op_b');
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].revision).toBeGreaterThan(entries[i].revision);
    }
    const entryA = entries.find((e: any) => e.opId === 'op_a');
    expect(entryA).toMatchObject({ ops: 2, author: 'tester' });
    expect(entryA.summary).toContain('node.create');
    const entryB = entries.find((e: any) => e.opId === 'op_b');
    expect(entryB.summary).toContain('node.update');
  });

  it('limit 截断只返回最近 N 步', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    await call(
      h,
      'ops.apply',
      { roomId, opId: 'op_x', ops: [{ op: 'node.create', node: { ...base, id: 'n_x111aaa1', name: 'x' } }] },
      roomId,
    );
    const res = await call(h, 'room.timeline', { roomId, limit: 1 }, roomId);
    const { entries } = res.body.result;
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain('node.create');
  });

  it('undoOp 之后该 opId 不再出现在时间线（不再可精确回退）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const base = await template(h, roomId);
    await call(
      h,
      'ops.apply',
      { roomId, opId: 'op_del', ops: [{ op: 'node.create', node: { ...base, id: 'n_y111aaa1', name: 'y' } }] },
      roomId,
    );
    const undo = await call(h, 'scene.undo', { roomId, opId: 'op_del' }, roomId);
    expect(undo.body.error).toBeUndefined();
    const res = await call(h, 'room.timeline', { roomId }, roomId);
    const { entries } = res.body.result;
    expect(entries.some((e: any) => e.opId === 'op_del')).toBe(false);
  });
});
