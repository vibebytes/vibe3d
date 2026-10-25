import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const solidPng = makePng(40, 30, () => [200, 40, 40, 255]).toString('base64');

const META = {
  fog: { enabled: true, color: 0x112233, near: 4, far: 40, mode: 'doc' as const },
  distanceToTarget: 10,
  camera: { position: [0, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
};

function fakeRenderer(meta?: unknown) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => ({
      mime: 'image/png',
      base64: solidPng,
      width: opts.width ?? 1280,
      height: opts.height ?? 720,
      ...(meta === undefined ? {} : { meta }),
    }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function roomWithBox(h: ReturnType<typeof makeHarness>): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '出图自证' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 1, 0] } },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('render fog report', () => {
  it('surfaces fog, distance and camera from the renderer meta', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer(META) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId, width: 320, height: 200 }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.fog).toEqual(META.fog);
    expect(body.result.distanceToTarget).toBe(10);
    expect(body.result.camera).toEqual(META.camera);
    expect(body.result.warning).toBeNull();
  });

  it('degrades to nulls when the renderer reports no meta', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer() as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.fog).toBeNull();
    expect(body.result.distanceToTarget).toBeNull();
    expect(body.result.camera).toBeNull();
    expect(body.result.warning).toBeNull();
  });

  it('warns when the subject sits past the fog far plane', async () => {
    const h = makeHarness();
    const meta = { ...META, distanceToTarget: 55 };
    h.ctx.renderer = fakeRenderer(meta) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId }, roomId);
    expect(body.result.warning).toContain('雾远端');
  });

  it('carries the report on node close-ups and every view', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer(META) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const node = await call(h, 'render.node', { roomId, nodeId }, roomId);
    expect(node.body.error).toBeUndefined();
    expect(node.body.result.fog).toEqual(META.fog);
    expect(node.body.result.warning).toBeNull();

    const views = await call(h, 'render.views', { roomId, views: ['front', 'top'] }, roomId);
    expect(views.body.error).toBeUndefined();
    expect(views.body.result.views).toHaveLength(2);
    for (const shot of views.body.result.views) {
      expect(shot.fog).toEqual(META.fog);
      expect(shot.distanceToTarget).toBe(10);
    }
  });
});
