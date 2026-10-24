import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;
const solidPng = makePng(40, 30, () => [200, 40, 40, 255]).toString('base64');

function fakeRenderer(seen: SnapshotOptions[]) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
      seen.push(structuredClone(opts));
      return { mime: 'image/png', base64: solidPng, width: opts.width ?? 1280, height: opts.height ?? 720 };
    },
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'overlay' });
  return body.result.roomId;
}

describe('render overlay 新种类', () => {
  it('ground / centerline / scale / normal 原样下发到渲染器', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const roomId = await room(h);
    const overlay = ['ground', 'centerline', 'scale', 'normal'];
    const { body } = await call(h, 'render.snapshot', { roomId, overlay }, roomId);
    expect(body.error).toBeUndefined();
    expect(seen[0]?.overlay).toEqual(overlay);
  });

  it('未知 overlay 在渲染前被拒绝', async () => {
    const h = makeHarness();
    const seen: SnapshotOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen) as unknown as DispatchContext['renderer'];
    const roomId = await room(h);
    const { body } = await call(h, 'render.snapshot', { roomId, overlay: ['heatmap'] }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(seen).toHaveLength(0);
  });
});
