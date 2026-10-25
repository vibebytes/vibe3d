import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const solidPng = makePng(20, 20, () => [10, 20, 30, 255]).toString('base64');

function fakeRenderer(seen: SnapshotOptions[]) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      seen.push(opts);
      return { mime: 'image/png', base64: solidPng, width: opts.width ?? 64, height: opts.height ?? 64 };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function roomWithBox(h: ReturnType<typeof makeHarness>): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '雾档' });
  const roomId = body.result.roomId;
  await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1] }, roomId);
  return roomId;
}

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code ?? '';

describe('W2 雾档透传', () => {
  it('默认 doc，显式 auto / off 原样透传给 renderer', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const roomId = await roomWithBox(h);

    await call(h, 'render.snapshot', { roomId }, roomId);
    await call(h, 'render.snapshot', { roomId, fog: 'auto' }, roomId);
    await call(h, 'render.snapshot', { roomId, fog: 'off' }, roomId);

    expect(seen.map((o) => o.fog)).toEqual(['doc', 'auto', 'off']);
  });

  it('未知雾档报 E_INVALID_PARAMS 且不触达 renderer', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const roomId = await roomWithBox(h);

    const { body } = await call(h, 'render.snapshot', { roomId, fog: 'soft' }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(seen).toHaveLength(0);
  });
});
