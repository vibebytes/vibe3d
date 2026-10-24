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
  const { body } = await call(h, 'room.create', { name: '多视角' });
  const roomId = body.result.roomId;
  const created = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 2, 0] } },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId };
}

describe('render.views', () => {
  it('returns one labelled shot per requested view with a framed camera', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId, nodeId } = await roomWithBox(h);

    const { body } = await call(
      h,
      'render.views',
      { roomId, views: ['front', 'top'], nodeIds: [nodeId], width: 320, height: 200 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.views.map((v: any) => v.view)).toEqual(['front', 'top']);
    expect(body.result.views.every((v: any) => v.base64 === 'AAAA')).toBe(true);
    expect(body.result.views[0].camera.target[1]).toBeCloseTo(2, 6);
    expect(body.result.target.min[1]).toBeCloseTo(1.5, 6);
    expect(body.result.target.max[1]).toBeCloseTo(2.5, 6);
    expect(seen).toHaveLength(2);
    expect(seen.every((o) => o.camera && o.width === 320 && o.height === 200)).toBe(true);
  });

  it('defaults to three views and frames the whole scene', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.views', { roomId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.views).toHaveLength(3);
    expect(body.result.views.map((v: any) => v.view)).toEqual(['three_quarter', 'front', 'top']);
    expect(seen.every((o) => o.camera?.mode === 'persp')).toBe(true);
  });

  it('rejects unknown node ids with a concrete error', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([]) as unknown as DispatchContext['renderer'];
    const { roomId } = await roomWithBox(h);

    const { body } = await call(h, 'render.views', { roomId, nodeIds: ['n_ffffffff'] }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(body.error)).toContain('n_ffffffff');
  });

  it('keeps E_RENDER_UNAVAILABLE when no renderer is wired', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBox(h);
    const { body } = await call(h, 'render.views', { roomId }, roomId);
    expect(codeOf(body)).toBe('E_RENDER_UNAVAILABLE');
  });
});
