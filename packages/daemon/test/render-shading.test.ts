import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;
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

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '着色' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 1, 0] } },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('render shading & overlay', () => {
  it('forwards shading and overlay to the renderer', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(
      h,
      'render.snapshot',
      { roomId, shading: 'wireframe', overlay: ['axes', 'bbox'], width: 320, height: 200 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(get(seen, 0).shading).toBe('wireframe');
    expect(get(seen, 0).overlay).toEqual(['axes', 'bbox']);
  });

  it('defaults to no shading and no overlay', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(get(seen, 0).shading).toBeUndefined();
    expect(get(seen, 0).overlay).toBeUndefined();
  });

  it('dedupes overlay and drops an empty list', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const dup = await call(
      h,
      'render.snapshot',
      { roomId, overlay: ['grid', 'grid'], width: 200, height: 120 },
      roomId,
    );
    expect(dup.body.error).toBeUndefined();
    expect(get(seen, 0).overlay).toEqual(['grid']);

    const empty = await call(h, 'render.snapshot', { roomId, overlay: [] }, roomId);
    expect(empty.body.error).toBeUndefined();
    expect(get(seen, 1).overlay).toBeUndefined();
  });

  it('shares the options with render.views, render.node and render.pick', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const views = await call(
      h,
      'render.views',
      { roomId, views: ['front'], shading: 'normals', overlay: ['grid'], width: 200, height: 160 },
      roomId,
    );
    expect(views.body.error).toBeUndefined();
    expect(get(seen, 0).shading).toBe('normals');
    expect(get(seen, 0).overlay).toEqual(['grid']);

    const node = await call(
      h,
      'render.node',
      { roomId, nodeId, shading: 'flat', overlay: ['bbox'], width: 200, height: 160 },
      roomId,
    );
    expect(node.body.error).toBeUndefined();
    expect(get(seen, 1).shading).toBe('flat');
    expect(get(seen, 1).overlay).toEqual(['bbox']);

    const pick = await call(
      h,
      'render.pick',
      {
        roomId,
        points: [{ x: 10, y: 10 }],
        shading: 'flat',
        overlay: ['axes'],
        width: 200,
        height: 160,
      },
      roomId,
    );
    expect(pick.body.error).toBeUndefined();
    expect(get(seen, 2).shading).toBe('flat');
    expect(get(seen, 2).overlay).toEqual(['axes']);
  });

  it('forwards the new material and rendered shading modes', async () => {
    for (const mode of ['material', 'rendered'] as const) {
      const h = makeHarness();
      const seen: SnapshotOptions[] = [];
      h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
      const { roomId } = await roomWithBox(h);
      const { body } = await call(
        h,
        'render.snapshot',
        { roomId, shading: mode, width: 200, height: 160 },
        roomId,
      );
      expect(body.error).toBeUndefined();
      expect(get(seen, 0).shading).toBe(mode);
    }
  });

  it('rejects unknown shading and overlay values', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const badShading = await call(h, 'render.snapshot', { roomId, shading: 'toon' }, roomId);
    expect(codeOf(badShading.body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(badShading.body.error)).toContain('shading');

    const badOverlay = await call(h, 'render.snapshot', { roomId, overlay: ['grid', 'light'] }, roomId);
    expect(codeOf(badOverlay.body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(badOverlay.body.error)).toContain('overlay');

    expect(seen).toHaveLength(0);
  });
});
