import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const get = (list: SnapshotOptions[], i: number): SnapshotOptions => list[i] as SnapshotOptions;
const solidPng = makePng(40, 30, () => [200, 40, 40, 255]).toString('base64');

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

async function twoBoxes(h: Harness): Promise<{ roomId: string; ids: string[] }> {
  const { body } = await call(h, 'room.create', { name: '高亮' });
  const roomId = body.result.roomId;
  const ids: string[] = [];
  for (const p of [
    [0, 0.5, 0],
    [2, 0.5, 0],
  ]) {
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p } },
      roomId,
    );
    ids.push(created.body.result.nodeId);
  }
  return { roomId, ids };
}

describe('render highlight & isolate', () => {
  it('forwards highlight and isolate to the renderer', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, ids } = await twoBoxes(h);

    const { body } = await call(
      h,
      'render.snapshot',
      { roomId, highlight: [ids[0]], isolate: [ids[1]], width: 320, height: 200 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(get(seen, 0).highlight).toEqual([ids[0]]);
    expect(get(seen, 0).isolate).toEqual([ids[1]]);
  });

  it('dedupes ids and drops empty lists', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, ids } = await twoBoxes(h);

    const dup = await call(
      h,
      'render.snapshot',
      { roomId, highlight: [ids[0], ids[0]], isolate: [] },
      roomId,
    );
    expect(dup.body.error).toBeUndefined();
    expect(get(seen, 0).highlight).toEqual([ids[0]]);
    expect(get(seen, 0).isolate).toBeUndefined();
  });

  it('rejects malformed node ids', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await twoBoxes(h);

    const { body } = await call(h, 'render.snapshot', { roomId, isolate: ['not-a-node'] }, roomId);
    expect(body.error).toBeDefined();
    expect(seen).toHaveLength(0);
  });

  it('shares the options with render.views and render.node', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, ids } = await twoBoxes(h);

    const views = await call(
      h,
      'render.views',
      { roomId, views: ['front'], highlight: [ids[0]], width: 200, height: 160 },
      roomId,
    );
    expect(views.body.error).toBeUndefined();
    expect(get(seen, 0).highlight).toEqual([ids[0]]);

    const node = await call(
      h,
      'render.node',
      { roomId, nodeId: ids[1], isolate: [ids[1]], width: 200, height: 160 },
      roomId,
    );
    expect(node.body.error).toBeUndefined();
    expect(get(seen, 1).isolate).toEqual([ids[1]]);
  });
});
