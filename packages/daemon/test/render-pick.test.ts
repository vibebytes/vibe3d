import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function fakeRenderer(base64: string) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => ({
      mime: 'image/png',
      base64,
      width: opts.width ?? 1280,
      height: opts.height ?? 720,
    }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  };
}

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '取色' });
  return body.result.roomId;
}

const halfRed = () => makePng(200, 100, (_x, y) => (y < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]));

describe('render.pick', () => {
  it('samples the exact pixel colour of a rendered PNG', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64')) as unknown as DispatchContext['renderer'];

    const { body } = await call(
      h,
      'render.pick',
      {
        roomId,
        points: [
          { x: 10, y: 10 },
          { x: 199, y: 99 },
        ],
        width: 200,
        height: 100,
      },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.width).toBe(200);
    expect(body.result.height).toBe(100);
    expect(body.result.samples).toEqual([
      { x: 10, y: 10, rgb: [255, 0, 0], hex: '#ff0000', alpha: 255 },
      { x: 199, y: 99, rgb: [0, 0, 255], hex: '#0000ff', alpha: 255 },
    ]);
  });

  it('summarises a region with a colour histogram and mean', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64')) as unknown as DispatchContext['renderer'];

    const { body } = await call(h, 'render.pick', { roomId, rect: { x: 0, y: 0, w: 200, h: 100 } }, roomId);
    expect(body.error).toBeUndefined();
    const region = body.result.region;
    expect(region.pixels).toBe(20000);
    expect(region.topColors).toHaveLength(2);
    expect(region.topColors[0]).toMatchObject({ hex: '#ff0000', count: 10000, share: 0.5 });
    expect(region.topColors[1]).toMatchObject({ hex: '#0000ff', count: 10000, share: 0.5 });
    expect(region.mean[0]).toBeCloseTo(127.5, 3);
    expect(region.mean[2]).toBeCloseTo(127.5, 3);
  });

  it('clamps a region that runs past the edge instead of failing', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64')) as unknown as DispatchContext['renderer'];

    const { body } = await call(
      h,
      'render.pick',
      { roomId, rect: { x: 150, y: 40, w: 200, h: 200 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.region.w).toBe(50);
    expect(body.result.region.h).toBe(60);
    expect(body.result.region.pixels).toBe(3000);
  });

  it('rejects an empty request, an out-of-bounds point and a bad rect', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64')) as unknown as DispatchContext['renderer'];

    const empty = await call(h, 'render.pick', { roomId }, roomId);
    expect(codeOf(empty.body)).toBe('E_INVALID_PARAMS');

    const outside = await call(h, 'render.pick', { roomId, points: [{ x: 400, y: 10 }] }, roomId);
    expect(codeOf(outside.body)).toBe('E_INVALID_PARAMS');

    const offCanvas = await call(
      h,
      'render.pick',
      { roomId, rect: { x: 300, y: 300, w: 20, h: 20 } },
      roomId,
    );
    expect(codeOf(offCanvas.body)).toBe('E_INVALID_PARAMS');
  });

  it('reports E_INVALID_PARAMS when the renderer hands back something that is not a PNG', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer('AAAA') as unknown as DispatchContext['renderer'];

    const { body } = await call(h, 'render.pick', { roomId, points: [{ x: 1, y: 1 }] }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(body.error.message).toContain('PNG');
  });

  it('reports E_RENDER_UNAVAILABLE when no renderer is attached', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { body } = await call(h, 'render.pick', { roomId, points: [{ x: 1, y: 1 }] }, roomId);
    expect(codeOf(body)).toBe('E_RENDER_UNAVAILABLE');
  });
});

describe('render.pick V2-03：[[x,y]] 元组与 node_id / material_id 同帧归属', () => {
  const COLOR = makePng(4, 4, () => [255, 0, 0, 255]).toString('base64');

  const idRgba = (paint: (x: number, y: number) => [number, number, number]): Uint8Array => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const at = (y * 4 + x) * 4;
        const [r, g, b] = paint(x, y);
        rgba[at] = r;
        rgba[at + 1] = g;
        rgba[at + 2] = b;
        rgba[at + 3] = 255;
      }
    }
    return rgba;
  };

  function fakeIdRenderer(rgba: Uint8Array, seen: Record<string, any>) {
    return {
      name: 'fake-id',
      ready: true,
      available: () => true,
      snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
        seen.snapshot = opts;
        return { mime: 'image/png', base64: COLOR, width: opts.width ?? 4, height: opts.height ?? 4 };
      },
      idPass: async (_input: unknown, opts: Record<string, any>) => {
        seen.idPass = opts;
        return { width: opts.width ?? 4, height: opts.height ?? 4, rgba };
      },
      exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
    } as unknown as DispatchContext['renderer'];
  }

  async function heroRoom(h: Harness): Promise<{ roomId: string; nodeId: string; materialId: string }> {
    const roomId = await room(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'box', name: 'hero' },
      roomId,
    );
    const nodeId = created.body.result.nodeId;
    const view = await call(h, 'node.get', { roomId, nodeId }, roomId);
    return { roomId, nodeId, materialId: view.body.result.materialId };
  }

  it('接受 [[x,y]] 元组，samples 带 node_id / material_id（与取色同一机位的 id pass）', async () => {
    const h = makeHarness();
    const { roomId, nodeId, materialId } = await heroRoom(h);
    const seen: Record<string, any> = {};
    h.ctx.renderer = fakeIdRenderer(
      idRgba((x, y) => (x === 2 && y === 1 ? [0, 0, 1] : [0, 0, 0])),
      seen,
    );

    const { body } = await call(
      h,
      'render.pick',
      { roomId, points: [[2, 1], [0, 0]], camera: { fov: 45 }, width: 4, height: 4 },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const s = body.result.samples;
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({
      x: 2,
      y: 1,
      rgb: [255, 0, 0],
      hex: '#ff0000',
      alpha: 255,
      node_id: nodeId,
      material_id: materialId,
    });
    expect(s[1]).toMatchObject({ x: 0, y: 0, node_id: null, material_id: null });
    expect(seen.idPass).toBeDefined();
    expect(seen.idPass.width).toBe(4);
    expect(seen.idPass.height).toBe(4);
    expect(seen.idPass.camera).toEqual(seen.snapshot.camera);
  });

  it('对象形态与元组形态等价', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await heroRoom(h);
    const seen: Record<string, any> = {};
    h.ctx.renderer = fakeIdRenderer(
      idRgba((x, y) => (x === 2 && y === 1 ? [0, 0, 1] : [0, 0, 0])),
      seen,
    );

    const objects = await call(
      h,
      'render.pick',
      { roomId, points: [{ x: 2, y: 1 }] },
      roomId,
    );
    const tuples = await call(h, 'render.pick', { roomId, points: [[2, 1]] }, roomId);
    expect(objects.body.error).toBeUndefined();
    expect(tuples.body.error).toBeUndefined();
    expect(objects.body.result.samples[0]).toEqual(tuples.body.result.samples[0]);
    expect(tuples.body.result.samples[0].node_id).toBe(nodeId);
  });

  it('渲染器不支持 id pass 时 samples 不带 node_id（向后兼容）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(COLOR);

    const { body } = await call(h, 'render.pick', { roomId, points: [[0, 0]] }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.samples[0]).toEqual({ x: 0, y: 0, rgb: [255, 0, 0], hex: '#ff0000', alpha: 255 });
    expect('node_id' in body.result.samples[0]).toBe(false);
  });

  it('元组越界报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    h.ctx.renderer = fakeRenderer(COLOR);

    const bad = await call(h, 'render.pick', { roomId, points: [[9999, 0]] }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });
});
