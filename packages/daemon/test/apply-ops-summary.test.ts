import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function setup(h: Harness) {
  const { body } = await call(h, 'room.create', { name: '摘要' });
  const roomId = body.result.roomId;
  const ids: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
    ids.push(created.body.result.nodeId);
  }
  const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
  return { roomId, ids, doc };
}

const codeOf = (body: any): string | undefined => body?.error?.data?.code ?? body?.error?.code;

describe('ops.apply summary：不用二次查询就知道改了什么', () => {
  it('created / updated / deleted 与实际一致', async () => {
    const h = makeHarness();
    const { roomId, ids, doc } = await setup(h);
    const template = doc.nodes[ids[0]!];
    const fresh = { ...structuredClone(template), id: 'n_00000009', name: '新盒子' };
    const { body } = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          { op: 'node.create', node: fresh },
          { op: 'node.update', id: ids[0], patch: { name: '改名' } },
          { op: 'node.delete', id: ids[1] },
        ],
      },
      roomId,
    );
    expect(codeOf(body)).toBeUndefined();
    expect(body.result.summary).toEqual({ created: 1, updated: 1, deleted: 1, trisDelta: 0 });
    expect(body.result.nodeCount).toBe(2);
  });

  it('dryRun 也返回 summary，但 revision 与场景不变', async () => {
    const h = makeHarness();
    const { roomId, ids, doc } = await setup(h);
    const before = (await call(h, 'scene.export', { roomId }, roomId)).body.result;
    const { body } = await call(
      h,
      'ops.apply',
      { roomId, dryRun: true, ops: [{ op: 'node.delete', id: ids[0] }] },
      roomId,
    );
    expect(body.result.summary).toEqual({ created: 0, updated: 0, deleted: 1, trisDelta: -12 });
    expect(body.result.revision).toBe(before.doc.revision);
    const after = (await call(h, 'scene.export', { roomId }, roomId)).body.result;
    expect(Object.keys(after.doc.nodes)).toHaveLength(Object.keys(doc.nodes).length);
  });

  it('trisDelta 与 scene.stats 的前后差值一致', async () => {
    const h = makeHarness();
    const { roomId, doc } = await setup(h);
    const before = (await call(h, 'scene.stats', { roomId }, roomId)).body.result;
    const template = doc.nodes[Object.keys(doc.nodes)[0]!];
    const fresh = { ...structuredClone(template), id: 'n_0000000a' };
    const { body } = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.create', node: fresh }] },
      roomId,
    );
    const after = (await call(h, 'scene.stats', { roomId }, roomId)).body.result;
    expect(body.result.summary.trisDelta).toBe(after.tris - before.tris);
  });
});
