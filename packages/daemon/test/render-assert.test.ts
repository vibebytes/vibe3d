import { describe, expect, it } from 'vitest';
import type { DispatchContext, SnapshotOptions } from '../src/context';
import { type Harness, call, makeHarness } from './helpers/harness';
import { anchorCases, idAnchorCases } from './helpers/assert-fixture';
import { makePng } from './helpers/png';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;
const halfRed = () => makePng(200, 100, (_x, y) => (y < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]));

function fakeRenderer(base64: string) {
  return {
    name: 'fake',
    ready: true,
    available: () => true,
    snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => ({
      mime: 'image/png',
      base64,
      width: opts.width ?? 200,
      height: opts.height ?? 100,
    }),
    exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
  } as unknown as DispatchContext['renderer'];
}

describe('render.assert V2-12：project + pick 串联的锚点验收', () => {
  it('7 锚点 fixture：5 过 2 挂，容差搜索回最近匹配像素', async () => {
    const h = makeHarness();
    const { body: rb } = await call(h, 'room.create', { name: 'assert' });
    const roomId = rb.result.roomId;
    await call(h, 'camera.set', { roomId, camera: { p: [0, 0, 5], target: [0, 0, 0], fov: 50 } }, roomId);
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64'));

    const cases = anchorCases();
    const { body } = await call(
      h,
      'render.assert',
      { roomId, width: 200, height: 100, anchors: cases.map((c) => c.anchor) },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const r = body.result;
    expect(r.width).toBe(200);
    expect(r.height).toBe(100);
    expect(r.summary).toEqual({ total: 7, passed: 5, failed: 2 });
    expect(r.pass).toBe(false);

    const edge = r.anchors[2];
    expect(edge.name).toBe('edge-tolerance-red');
    expect(edge.ok).toBe(true);
    expect(edge.dist_px).toBeGreaterThan(0);
    expect(edge.dist_px).toBeLessThanOrEqual(8);
    expect(edge.de).toBe(0);

    const wrong = r.anchors[3];
    expect(wrong.ok).toBe(false);
    expect(wrong.reasons).toEqual(['colour_mismatch']);
    expect(wrong.got.hex).toBe('#ff0000');
    expect(wrong.de).toBeGreaterThan(12);

    const probe = r.anchors[4];
    expect(probe.ok).toBe(true);
    expect(probe.got).toMatchObject({ hex: '#ff0000', alpha: 255 });
    expect(probe.expected.hex).toBeUndefined();

    const projected = r.anchors[5];
    expect(projected.ok).toBe(true);
    expect(projected.at).toEqual([100, 50]);
    expect(projected.in_view).toBe(true);

    const behind = r.anchors[6];
    expect(behind.ok).toBe(false);
    expect(behind.reasons).toEqual(['out_of_view']);
    expect(behind.in_view).toBe(false);
    expect(behind.got).toBeNull();

    for (let i = 0; i < cases.length; i += 1) {
      const anchor = r.anchors[i]!;
      const item = cases[i]!;
      expect(anchor.name).toBe(item.name);
      expect(anchor.ok).toBe(item.ok);
      if (!item.ok) expect(anchor.reasons).toEqual(item.reasons);
    }
  });

  it('node / material 期望走同帧 id pass，未命中回报 node_mismatch', async () => {
    const h = makeHarness();
    const { body: rb } = await call(h, 'room.create', { name: 'assert-id' });
    const roomId = rb.result.roomId;
    const created = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', name: 'hero' }, roomId);
    const nodeId = created.body.result.nodeId;
    const view = await call(h, 'node.get', { roomId, nodeId }, roomId);
    const materialId = view.body.result.materialId;

    const n = 64;
    const rgba = new Uint8Array(4 * n * n);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const at = (y * n + x) * 4;
        const [r, g, b] = x === 2 && y === 1 ? [0, 0, 1] : [0, 0, 0];
        rgba[at] = r;
        rgba[at + 1] = g;
        rgba[at + 2] = b;
        rgba[at + 3] = 255;
      }
    }
    const seen: Record<string, any> = {};
    h.ctx.renderer = {
      name: 'fake-id',
      ready: true,
      available: () => true,
      snapshot: async (_input: unknown, opts: SnapshotOptions = {}) => {
        seen.snapshot = opts;
        return { mime: 'image/png', base64: halfRed().toString('base64'), width: 64, height: 64 };
      },
      idPass: async (_input: unknown, opts: Record<string, any>) => {
        seen.idPass = opts;
        return { width: 64, height: 64, rgba };
      },
      exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
    } as unknown as DispatchContext['renderer'];

    const cases = idAnchorCases(nodeId, materialId);
    const { body } = await call(
      h,
      'render.assert',
      { roomId, width: 64, height: 64, anchors: cases.map((c) => c.anchor) },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const r = body.result;
    expect(r.summary).toEqual({ total: 2, passed: 1, failed: 1 });
    const hit = r.anchors[0];
    expect(hit.ok).toBe(true);
    expect(hit.got.node_id).toBe(nodeId);
    expect(hit.got.material_id).toBe(materialId);
    const miss = r.anchors[1];
    expect(miss.ok).toBe(false);
    expect(miss.reasons).toEqual(['node_mismatch']);
    expect(miss.got.node_id).toBeNull();
    expect(seen.idPass.camera).toEqual(seen.snapshot.camera);
  });

  it('锚点缺失、空数组与越界坐标按契约报错', async () => {
    const h = makeHarness();
    const { body: rb } = await call(h, 'room.create', { name: 'assert-args' });
    const roomId = rb.result.roomId;
    h.ctx.renderer = fakeRenderer(halfRed().toString('base64'));

    const missing = await call(h, 'render.assert', { roomId }, roomId);
    expect(codeOf(missing.body)).toBe('E_INVALID_PARAMS');

    const empty = await call(h, 'render.assert', { roomId, anchors: [] }, roomId);
    expect(codeOf(empty.body)).toBe('E_INVALID_PARAMS');

    const both = await call(
      h,
      'render.assert',
      { roomId, anchors: [{ at: [300, 10] }] },
      roomId,
    );
    expect(both.body.error).toBeUndefined();
    const a = both.body.result.anchors[0];
    expect(a.ok).toBe(false);
    expect(a.reasons).toEqual(['out_of_bounds']);
    expect(both.body.result.summary).toEqual({ total: 1, passed: 0, failed: 1 });
  });
});
