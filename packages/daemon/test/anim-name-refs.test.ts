import { describe, expect, it } from 'vitest';
import { call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;
const spin = { type: 'spin', speed: 1 };

async function setup() {
  const h = makeHarness();
  const { body } = await call(h, 'room.create', { name: 'refs' });
  const roomId = body.result.roomId as string;
  const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', name: 'hip' }, roomId);
  return { h, roomId, nodeId: created.body.result.nodeId as string };
}

describe('@name refs on animation and fx targets', () => {
  it('animation.define / clear accept @name', async () => {
    const { h, roomId, nodeId } = await setup();
    const def = await call(h, 'animation.define', { roomId, nodeId: '@hip', clip: spin }, roomId);
    expect(def.body.error).toBeUndefined();
    expect(def.body.result.nodeId).toBe(nodeId);
    const clr = await call(h, 'animation.clear', { roomId, nodeId: '@hip' }, roomId);
    expect(clr.body.result.appliedTo).toEqual([nodeId]);
  });

  it('animation.pose targets accept @name', async () => {
    const { h, roomId, nodeId } = await setup();
    const clip = { type: 'keyframes', channel: 'rx', keys: [{ t: 0, v: 0.3 }] };
    const { body } = await call(h, 'animation.pose', { roomId, targets: [{ nodeId: '@hip', clip }] }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.appliedTo).toEqual([nodeId]);
  });

  it('animation.stop accepts @name', async () => {
    const { h, roomId } = await setup();
    await call(h, 'animation.define', { roomId, nodeId: '@hip', clip: spin }, roomId);
    const { body } = await call(h, 'animation.stop', { roomId, nodeId: '@hip' }, roomId);
    expect(body.error).toBeUndefined();
  });

  it('fx.create nodeId accepts @name', async () => {
    const { h, roomId, nodeId } = await setup();
    const { body } = await call(h, 'fx.create', { roomId, type: 'particles', nodeId: '@hip' }, roomId);
    expect(body.error).toBeUndefined();
    const scene = await call(h, 'scene.get', { roomId }, roomId);
    expect(scene.body.result.doc?.fx?.[0]?.nodeId ?? scene.body.result.fx?.[0]?.nodeId).toBe(nodeId);
  });

  it('unknown @name is E_NODE_NOT_FOUND', async () => {
    const { h, roomId } = await setup();
    const { body } = await call(h, 'animation.define', { roomId, nodeId: '@nope', clip: spin }, roomId);
    expect(codeOf(body)).toBe('E_NODE_NOT_FOUND');
  });
});
