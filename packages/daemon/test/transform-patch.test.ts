import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function box(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '位移补丁' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', transform: { p: [0, 0, 0], r: [0.3, 0.4, 0.5], s: [1, 1, 1] } },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

async function transformOf(h: Harness, roomId: string, nodeId: string) {
  const { body } = await call(h, 'scene.export', { roomId }, roomId);
  return body.result.doc.nodes[nodeId].transform;
}

describe('transformPatch：只给一轴，其余保持不变', () => {
  it('patch.transform 只给 p 时 r/s 不被清零', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await box(h);
    const res = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id: nodeId, patch: { transform: { p: [1, 2, 3] } } }] },
      roomId,
    );
    expect(res.body.error).toBeUndefined();

    const t = await transformOf(h, roomId, nodeId);
    expect(t.p).toEqual([1, 2, 3]);
    expect(t.r).toEqual([0.3, 0.4, 0.5]);
    expect(t.s).toEqual([1, 1, 1]);
  });

  it('给全量 p/r/s 时与原语义等价', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await box(h);
    const next = { p: [4, 5, 6], r: [0.1, 0.2, 0.3], s: [2, 2, 2] };
    await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id: nodeId, patch: { transform: next } }] },
      roomId,
    );
    expect(await transformOf(h, roomId, nodeId)).toEqual(next);
  });

  it('NaN / Infinity 被拒，场景保持原样', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await box(h);
    const bad = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.update', id: nodeId, patch: { transform: { p: [1, null, 3] } } }] },
      roomId,
    );
    expect(bad.body.error?.data?.code ?? bad.body.error?.code).toBe('E_INVALID_PARAMS');
    expect(await transformOf(h, roomId, nodeId)).toEqual({ p: [0, 0, 0], r: [0.3, 0.4, 0.5], s: [1, 1, 1] });
  });
});
