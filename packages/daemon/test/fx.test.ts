import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '特效' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', name: 'box', shape: 'box', size: [1, 1, 1] },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('fx.create', () => {
  it('appends a particle emitter to doc.fx', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(
      h,
      'fx.create',
      { roomId, type: 'particles', position: [0, 2, 0], rate: 30, life: 2, color: [1, 0.8, 0.4, 1] },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.fxId).toMatch(/^f_[a-z0-9]{8}$/);
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.fx).toHaveLength(1);
    expect(after.body.result.doc.fx[0].type).toBe('particles');
  });

  it('rejects an unknown nodeId', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'fx.create', { roomId, type: 'shaft', nodeId: 'n_ffffffff' }, roomId);
    expect(codeOf(body)).toBe('E_NODE_NOT_FOUND');
  });

  it('keeps the document valid after adding fx', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    await call(h, 'fx.create', { roomId, type: 'particles' }, roomId);
    const { body } = await call(h, 'scene.validate', { roomId }, roomId);
    expect(body.result.issues).toEqual([]);
  });
});

describe('fx.delete', () => {
  it('removes the emitter and supports undo', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const created = await call(h, 'fx.create', { roomId, type: 'particles' }, roomId);
    const fxId = created.body.result.fxId;
    const { body } = await call(h, 'fx.delete', { roomId, fxId }, roomId);
    expect(body.result.removed).toBe(true);
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.fx).toHaveLength(0);
    await call(h, 'scene.undo', { roomId }, roomId);
    const undone = await call(h, 'scene.get', { roomId }, roomId);
    expect(undone.body.result.doc.fx).toHaveLength(1);
  });

  it('reports a missing fx id', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'fx.delete', { roomId, fxId: 'f_ffffffff' }, roomId);
    expect(body.result.removed).toBe(false);
  });
});

describe('env.set fog', () => {
  it('stores fog on doc.env and clears it back to null', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    await call(h, 'env.set', { roomId, fog: { color: [0.1, 0.2, 0.3, 1], near: 4, far: 20 } }, roomId);
    const on = await call(h, 'scene.get', { roomId }, roomId);
    expect(on.body.result.doc.env.fog.near).toBe(4);
    await call(h, 'env.set', { roomId, fog: null }, roomId);
    const off = await call(h, 'scene.get', { roomId }, roomId);
    expect(off.body.result.doc.env.fog).toBeUndefined();
  });

  it('accepts fog: false as an explicit off switch', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    await call(h, 'env.set', { roomId, fog: { color: [0.1, 0.2, 0.3, 1], near: 8, far: 6 } }, roomId);
    const { body } = await call(h, 'env.set', { roomId, fog: false }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.env.fog).toBeUndefined();
    const after = await call(h, 'scene.get', { roomId }, roomId);
    expect(after.body.result.doc.env.fog).toBeUndefined();
  });
});
