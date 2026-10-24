import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function twoBoxes(h: Harness): Promise<{ roomId: string; near: string; far: string }> {
  const { body } = await call(h, 'room.create', { name: '拾取' });
  const roomId = body.result.roomId;
  const near = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', name: 'near', transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } },
    roomId,
  );
  const far = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', name: 'far', transform: { p: [0, 0, -10], r: [0, 0, 0], s: [1, 1, 1] } },
    roomId,
  );
  return { roomId, near: near.body.result.nodeId, far: far.body.result.nodeId };
}

describe('scene.pick handler', () => {
  it('射线命中最近节点并返回候选', async () => {
    const h = makeHarness();
    const { roomId, near, far } = await twoBoxes(h);
    const { body } = await call(
      h,
      'scene.pick',
      { roomId, ray: { origin: [0, 0, 5], direction: [0, 0, -1] }, limit: 4 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.nodeId).toBe(near);
    expect(body.result.distance).toBeCloseTo(4.5, 4);
    expect(body.result.candidates.map((c: { nodeId: string }) => c.nodeId)).toEqual([near, far]);
  });

  it('打空返回 null 而不是报错', async () => {
    const h = makeHarness();
    const { roomId } = await twoBoxes(h);
    const { body } = await call(
      h,
      'scene.pick',
      { roomId, ray: { origin: [0, 0, 5], direction: [0, 1, 0] } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.nodeId).toBeNull();
    expect(body.result.hitPoint).toBeNull();
    expect(body.result.candidates).toEqual([]);
  });
});
