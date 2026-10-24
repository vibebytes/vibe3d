import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '动画' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name: 'box', shape: 'box', size: [1, 1, 1] },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('animation.define', () => {
  it('stores the clip on the node and can be undone', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await roomWithBox(h);
    const clip = { type: 'float', channel: 'py', amplitude: 0.5, frequency: 0.2 };
    const { body } = await call(h, 'animation.define', { roomId, nodeId, clip }, roomId);
    expect(body.error).toBeUndefined();
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.nodes[nodeId].clip.type).toBe('float');
    await call(h, 'scene.undo', { roomId }, roomId);
    const undone = await call(h, 'scene.get', { roomId }, roomId);
    expect(undone.body.result.doc.nodes[nodeId].clip).toBeUndefined();
  });

  it('rejects an unknown node', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(
      h,
      'animation.define',
      { roomId, nodeId: 'n_ffffffff', clip: { type: 'spin' } },
      roomId,
    );
    expect(codeOf(body)).toBe('E_NODE_NOT_FOUND');
  });

  it('survives a room reload with persistence on', async () => {
    const h = makeHarness({ persist: true });
    const { roomId, nodeId } = await roomWithBox(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: { type: 'spin', speed: 0.5 } }, roomId);
    h.rooms.close(roomId);
    h.rooms.load();
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.nodes[nodeId].clip.speed).toBe(0.5);
  });
});

describe('animation.clear', () => {
  it('removes the clip and reports cleared', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await roomWithBox(h);
    await call(h, 'animation.define', { roomId, nodeId, clip: { type: 'sway' } }, roomId);
    const { body } = await call(h, 'animation.clear', { roomId, nodeId }, roomId);
    expect(body.result.cleared).toBe(true);
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.nodes[nodeId].clip).toBeUndefined();
  });
});
