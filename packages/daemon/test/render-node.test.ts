import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function fakeRenderer(seen: SnapshotOptions[]) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      seen.push(structuredClone(opts));
      return {
        mime: 'image/png',
        base64: 'AAAA',
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
      };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function roomWithBox(
  h: Harness,
  opts: { p?: [number, number, number]; visible?: boolean } = {},
): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '特写' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: opts.p ?? [0, 2, 0] },
    },
    roomId,
  );
  const nodeId = created.body.result.nodeId;
  if (opts.visible === false) {
    await call(h, 'node.update', { roomId, nodeId, patch: { visible: false } }, roomId);
  }
  return { roomId, nodeId };
}

describe('render.node', () => {
  it('frames one node and returns its world bounds plus the camera used', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const { body } = await call(h, 'render.node', { roomId, nodeId, width: 320, height: 200 }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.nodeId).toBe(nodeId);
    expect(body.result.base64).toBe('AAAA');
    expect(body.result.target.min[1]).toBeCloseTo(1.5, 6);
    expect(body.result.target.max[1]).toBeCloseTo(2.5, 6);
    expect(body.result.camera.target[1]).toBeCloseTo(2, 6);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.camera).toEqual(body.result.camera);
    expect(seen[0]?.width).toBe(320);
  });

  it('scales camera distance by padding, leaving the target alone', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const tight = await call(h, 'render.node', { roomId, nodeId, padding: 1 }, roomId);
    const loose = await call(h, 'render.node', { roomId, nodeId, padding: 2 }, roomId);
    const dist = (r: any) =>
      Math.hypot(
        r.camera.p[0] - r.camera.target[0],
        r.camera.p[1] - r.camera.target[1],
        r.camera.p[2] - r.camera.target[2],
      );

    expect(dist(loose.body.result) / dist(tight.body.result)).toBeCloseTo(2, 5);
    expect(loose.body.result.camera.target).toEqual(tight.body.result.camera.target);
    expect(loose.body.result.target).toEqual(tight.body.result.target);
    expect(dist(tight.body.result)).toBeLessThan(dist(loose.body.result));
  });

  it('honours the requested view direction', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([]) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const { body } = await call(h, 'render.node', { roomId, nodeId, view: 'front' }, roomId);
    const cam = body.result.camera;
    expect(cam.p[0]).toBeCloseTo(cam.target[0], 6);
    expect(cam.p[2]).toBeGreaterThan(cam.target[2]);
  });

  it('rejects unknown, hidden and geometry-less nodes', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([]) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h, { visible: false });
    const empty = await call(h, 'node.create', { roomId, kind: 'group' }, roomId);

    const unknown = await call(h, 'render.node', { roomId, nodeId: 'n_ffffffff' }, roomId);
    expect(codeOf(unknown.body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(unknown.body.error)).toContain('n_ffffffff');

    const hidden = await call(h, 'render.node', { roomId, nodeId }, roomId);
    expect(codeOf(hidden.body)).toBe('E_INVALID_PARAMS');

    const group = await call(h, 'render.node', { roomId, nodeId: empty.body.result.nodeId }, roomId);
    expect(codeOf(group.body)).toBe('E_INVALID_PARAMS');
  });

  it('rejects out-of-range padding', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([]) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const zero = await call(h, 'render.node', { roomId, nodeId, padding: 0 }, roomId);
    expect(codeOf(zero.body)).toBe('E_INVALID_PARAMS');
    const huge = await call(h, 'render.node', { roomId, nodeId, padding: 99 }, roomId);
    expect(codeOf(huge.body)).toBe('E_INVALID_PARAMS');
  });

  it('keeps E_RENDER_UNAVAILABLE when no renderer is wired', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await roomWithBox(h);
    const { body } = await call(h, 'render.node', { roomId, nodeId }, roomId);
    expect(codeOf(body)).toBe('E_RENDER_UNAVAILABLE');
  });
});
