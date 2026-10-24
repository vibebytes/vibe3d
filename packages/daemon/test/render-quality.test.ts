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

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: '画质档' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 2, 0] } },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('render quality', () => {
  it('passes the resolved preset to the renderer and echoes it', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(
      h,
      'render.snapshot',
      { roomId, quality: 'high', width: 320, height: 200 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.quality).toMatchObject({
      level: 'high',
      pixelRatio: 2,
      samples: 4,
      shadowMapSize: 2048,
      supersample: true,
    });
    expect(body.result.quality).toMatchObject({ level: 'high', pixelRatio: 2 });
  });

  it('defaults to the standard preset when quality is omitted', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(seen[0]?.quality?.level).toBe('standard');
    expect(body.result.quality).toMatchObject({ level: 'standard', samples: 4 });
  });

  it('rejects unknown quality levels before touching the renderer', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId, quality: 'ultra' }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(seen).toHaveLength(0);
  });

  it('applies the same preset to every view and to node close-ups', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const views = await call(
      h,
      'render.views',
      { roomId, views: ['front', 'top'], quality: 'draft' },
      roomId,
    );
    expect(views.body.error).toBeUndefined();
    expect(views.body.result.quality).toMatchObject({ level: 'draft', samples: 0 });
    expect(seen.every((o) => o.quality?.level === 'draft')).toBe(true);

    const node = await call(h, 'render.node', { roomId, nodeId, quality: 'high' }, roomId);
    expect(node.body.error).toBeUndefined();
    expect(node.body.result.quality).toMatchObject({ level: 'high', shadowMapSize: 2048 });
  });
});
