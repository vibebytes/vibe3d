import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const solidPng = makePng(24, 18, (_x: number, _y: number) => [40, 90, 160, 255] as const).toString(
  'base64',
);
const get = (list: SnapshotOptions[], i: number): SnapshotOptions => list[i] as SnapshotOptions;

function fakeRenderer(seen: SnapshotOptions[]) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      seen.push(structuredClone(opts));
      return {
        mime: 'image/png',
        base64: solidPng,
        width: opts.width ?? 1280,
        height: opts.height ?? 720,
      };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function boxRoom(h: Harness, withClip = false): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '动画' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 1, 0] } },
    roomId,
  );
  const nodeId = created.body.result.nodeId;
  if (withClip) {
    const defined = await call(
      h,
      'animation.define',
      { roomId, nodeId, clip: { type: 'sway', channel: 'rz', amplitude: 0.4, frequency: 0.5 } },
      roomId,
    );
    expect(defined.body.error).toBeUndefined();
  }
  return { roomId, nodeId };
}

describe('render at time', () => {
  it('forwards at to the renderer and keeps both samples distinct', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await boxRoom(h, true);

    const a = await call(h, 'render.snapshot', { roomId, at: 0, width: 120, height: 90 }, roomId);
    const b = await call(h, 'render.snapshot', { roomId, at: 1.5, width: 120, height: 90 }, roomId);
    expect(a.body.error).toBeUndefined();
    expect(b.body.error).toBeUndefined();
    expect(get(seen, 0).at).toBe(0);
    expect(get(seen, 1).at).toBe(1.5);
  });

  it('defaults at to 0 when the document owns a clip', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await boxRoom(h, true);

    const { body } = await call(h, 'render.snapshot', { roomId, width: 120, height: 90 }, roomId);
    expect(body.error).toBeUndefined();
    expect(get(seen, 0).at).toBe(0);
  });

  it('leaves at undefined when no node carries a clip', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await boxRoom(h);

    const { body } = await call(h, 'render.snapshot', { roomId, width: 120, height: 90 }, roomId);
    expect(body.error).toBeUndefined();
    expect(get(seen, 0).at).toBeUndefined();
  });

  it('applies the same default to every view in render.views', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await boxRoom(h, true);

    const { body } = await call(
      h,
      'render.views',
      { roomId, views: ['front', 'top'], width: 120, height: 90 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(seen).toHaveLength(2);
    for (const opts of seen) expect(opts.at).toBe(0);
  });

  it('keeps an explicit at when the document has no clip', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await boxRoom(h);

    const { body } = await call(h, 'render.snapshot', { roomId, at: 2.25 }, roomId);
    expect(body.error).toBeUndefined();
    expect(get(seen, 0).at).toBe(2.25);
  });
});
