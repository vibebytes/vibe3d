import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '反馈' });
  return body.result.roomId;
}

const STAGE = { preset: 'clean', autoExposure: true, ground: true, keepModelLights: false } as const;

describe('ops.apply：让“场景没变化”可被调用方察觉', () => {
  it('空场景只改舞台：nodeCount 为 0，并给出 hint', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { body } = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'stage.set', stage: STAGE }] },
      roomId,
    );
    expect(body.result.applied).toBe(1);
    expect(body.result.nodeCount).toBe(0);
    expect(body.result.hint).toContain('vibe3d_create_node');
  });

  it('node.create 落地后 nodeCount 递增，且不再给空场景 hint', async () => {
    const h = makeHarness();
    h.ctx.surfaces = () => 1;
    const roomId = await room(h);
    const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
    const nodeId = created.body.result.nodeId;
    const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
    await call(h, 'node.delete', { roomId, nodeId }, roomId);

    const { body } = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'node.create', node: doc.nodes[nodeId] }] },
      roomId,
    );
    expect(body.result.nodeCount).toBe(1);
    expect(body.result.hint).toBeUndefined();
  });

  it('dryRun 同样返回 nodeCount（不落盘）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { body } = await call(
      h,
      'ops.apply',
      { roomId, ops: [{ op: 'stage.set', stage: STAGE }], dryRun: true },
      roomId,
    );
    expect(body.result.nodeCount).toBe(0);
    expect(body.result.applied).toBe(1);
  });
});
