import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { DispatchContext, IdPassOptions, IdPassShot } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';

const code = (body: { error?: { data?: { code?: string }; code?: string } }): string | undefined =>
  body.error?.data?.code ?? body.error?.code;

function paint(opts: IdPassOptions, cells: Array<[number, string]>): IdPassShot {
  const rgba = new Uint8Array(opts.width * opts.height * 4);
  for (const [offset, hex] of cells) {
    const rgb = Number.parseInt(hex.slice(1), 16);
    const p = offset * 4;
    rgba[p] = (rgb >> 16) & 0xff;
    rgba[p + 1] = (rgb >> 8) & 0xff;
    rgba[p + 2] = rgb & 0xff;
    rgba[p + 3] = 255;
  }
  return { width: opts.width, height: opts.height, rgba };
}

function fakeRenderer(
  seen: IdPassOptions[],
  paintCells: (opts: IdPassOptions) => Array<[number, string]>,
): NonNullable<DispatchContext['renderer']> {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
    idPass: async (_input, opts) => {
      seen.push(structuredClone(opts));
      return paint(opts, paintCells(opts));
    },
  } as NonNullable<DispatchContext['renderer']>;
}

async function boxes(h: Harness, count: number): Promise<{ roomId: string; ids: string[] }> {
  const { body } = await call(h, 'room.create', { name: 'id-pass' });
  const roomId = body.result.roomId as string;
  const ids = Array.from({ length: count }, (_, i) => `n_${(i + 1).toString(16).padStart(8, '0')}`);
  const ops: unknown[] = [
    { op: 'material.create', id: 'm_00000001', preset: 'concrete' },
    ...ids.map((id, i) => ({
      op: 'node.create',
      node: {
        id,
        name: `box${i + 1}`,
        parent: null,
        visible: true,
        transform: { p: [i * 2, 1, 0], r: [0, 0, 0], s: [1, 1, 1] },
        kind: 'mesh',
        geometry: { type: 'box', size: [1, 1, 1] },
        material: 'm_00000001',
      },
    })),
  ];
  const applied = await call(h, 'ops.apply', { roomId, ops }, roomId);
  expect(applied.body.error).toBeUndefined();
  return { roomId, ids };
}

describe('render.id-pass', () => {
  it('reports E_RENDER_UNAVAILABLE without a renderer', async () => {
    const h = makeHarness();
    const { roomId } = await boxes(h, 1);
    const { body } = await call(h, 'render.id-pass', { roomId }, roomId);
    expect(code(body)).toBe('E_RENDER_UNAVAILABLE');
  });

  it('builds a legend and returns pixel coverage per node', async () => {
    const h = makeHarness();
    const seen: IdPassOptions[] = [];
    h.ctx.renderer = fakeRenderer(seen, (opts) => {
      const order = Object.values(opts.legend).sort();
      return [
        [0, order[1] ?? '#000002'],
        [1, order[1] ?? '#000002'],
        [2, order[0] ?? '#000001'],
      ];
    });
    const { roomId, ids } = await boxes(h, 2);

    const { body } = await call(h, 'render.id-pass', { roomId, width: 64, height: 64 }, roomId);
    expect(body.error).toBeUndefined();
    const result = body.result;
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(Object.keys(result.legend).sort()).toEqual([...ids].sort());
    expect(result.coverage).toHaveLength(2);
    expect(result.coverage[0].pixels).toBe(2);
    expect(result.coverage[1].pixels).toBe(1);
    expect(result.unknown).toBe(0);
    expect(result.share).toBeUndefined();
    expect(result.mask).toBeUndefined();
    expect(seen[0]?.legend).toEqual(result.legend);
  });

  it('returns a deflated index mask when includeMask is set', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([], (opts) => {
      const first = Object.values(opts.legend).sort()[0] ?? '#000001';
      return [[5, first]];
    });
    const { roomId } = await boxes(h, 1);

    const { body } = await call(
      h,
      'render.id-pass',
      { roomId, width: 64, height: 64, includeMask: true },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const mask = body.result.mask;
    expect(mask.encoding).toBe('deflate-index8');
    const raw = inflateRawSync(Buffer.from(mask.base64, 'base64'));
    expect(raw.length).toBe(64 * 64);
    expect(raw[5]).toBe(1);
    expect(raw[0]).toBe(0);
  });

  it('rejects oversized rasters and over-full palettes', async () => {
    const h = makeHarness();
    h.ctx.renderer = fakeRenderer([], () => []);
    const { roomId } = await boxes(h, 1);

    const big = await call(h, 'render.id-pass', { roomId, width: 1280, height: 800 }, roomId);
    expect(code(big.body)).toBe('E_INVALID_PARAMS');

    const crowded = await boxes(h, 256);
    const many = await call(h, 'render.id-pass', { roomId: crowded.roomId }, crowded.roomId);
    expect(code(many.body)).toBe('E_INVALID_PARAMS');
  });
});
