import { pickNode } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const PERSP = { mode: 'persp' as const, p: [0, 0, 10], target: [0, 0, 0], fov: 60, zoom: 1 };
const ORTHO = { mode: 'ortho' as const, p: [0, 0, 10], target: [0, 0, 0], fov: 60, zoom: 2 };
const W = 1280;
const H = 720;
const HALF_H = Math.tan((30 * Math.PI) / 180);
const HALF_W = HALF_H * (W / H);

const D = 10;
const ANCHORS: [string, [number, number, number]][] = [
  ['中心', [0, 0, 0]],
  ['右上四分', [HALF_W * (D / 2), HALF_H * (D / 2), 0]],
  ['左下四分', [-HALF_W * (D / 2), -HALF_H * (D / 2), 0]],
  ['右缘', [HALF_W * D, 0, 0]],
  ['近景', [0, 0, 5]],
  ['远景', [0, 0, -5]],
  ['画外', [HALF_W * D * 2, 0, 0]],
];

async function roomWithBoxes(
  h: Harness,
  at: [number, number, number][],
): Promise<{ roomId: string; ids: string[] }> {
  const { body } = await call(h, 'room.create', { name: '投影锚点' });
  const roomId = body.result.roomId;
  const ids: string[] = [];
  for (const [i, p] of at.entries()) {
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', name: `锚-${i}`, shape: 'box', size: [1, 1, 1], transform: { p } },
      roomId,
    );
    ids.push(created.body.result.nodeId);
  }
  return { roomId, ids };
}

describe('camera.project：世界坐标 → 像素（像素坐标系与 snapshot 一致）', () => {
  it('7 锚点 golden：精确像素、深度、in_view', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(
      h,
      ANCHORS.map(([, p]) => p),
    );
    const { body } = await call(
      h,
      'camera.project',
      { roomId, points: ANCHORS.map(([, p]) => p), camera: PERSP, width: W, height: H },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const r = body.result;
    expect(r.width).toBe(W);
    expect(r.height).toBe(H);
    expect(r.source).toBe('math');
    expect(r.camera).toEqual(PERSP);
    const px = r.points.map((o: any) => o.px);
    expect(px[0][0]).toBeCloseTo(640, 6);
    expect(px[0][1]).toBeCloseTo(360, 6);
    expect(px[1][0]).toBeCloseTo(960, 6);
    expect(px[1][1]).toBeCloseTo(180, 6);
    expect(px[2][0]).toBeCloseTo(320, 6);
    expect(px[2][1]).toBeCloseTo(540, 6);
    expect(px[3][0]).toBeCloseTo(1280, 6);
    expect(px[3][1]).toBeCloseTo(360, 6);
    expect(px[4][0]).toBeCloseTo(640, 6);
    expect(px[4][1]).toBeCloseTo(360, 6);
    expect(px[6][0]).toBeGreaterThan(W);
    expect(r.points.map((o: any) => Math.round(o.depth * 1e6) / 1e6)).toEqual([10, 10, 10, 10, 5, 15, 10]);
    expect(r.points.map((o: any) => o.in_view)).toEqual([true, true, true, true, true, true, false]);
  });

  it('与 scene.pick 同帧一致：像素中心反查必命中同一节点（≤1px 语义）', async () => {
    const h = makeHarness();
    const inView = ANCHORS.slice(0, 4).map(([, p]) => p);
    const { roomId, ids } = await roomWithBoxes(h, inView);
    const { body } = await call(
      h,
      'camera.project',
      { roomId, points: inView, camera: PERSP, width: W, height: H },
      roomId,
    );
    const px = body.result.points.map((o: any) => o.px);
    const room = h.ctx.rooms.get(roomId);
    for (const [i, id] of ids.entries()) {
      const hit = pickNode(room.doc, {
        point: [px[i][0] / W, px[i][1] / H],
        width: W,
        height: H,
        camera: PERSP as any,
      });
      expect(hit.nodeId).toBe(id);
    }
  });

  it('正交相机：zoom 换算与 golden', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(h, [
      [0, 0, 0],
      [0.444444, 0, 0],
      [0, 0.25, 0],
    ]);
    const { body } = await call(
      h,
      'camera.project',
      {
        roomId,
        points: [
          [0, 0, 0],
          [0.444444, 0, 0],
          [0, 0.25, 0],
        ],
        camera: ORTHO,
        width: W,
        height: H,
      },
      roomId,
    );
    const r = body.result;
    expect(r.points[0].px).toEqual([640, 360]);
    expect(r.points[1].px[0]).toBeCloseTo(960, 3);
    expect(r.points[2].px[1]).toBeCloseTo(180, 3);
    expect(r.points.every((o: any) => o.in_view)).toBe(true);
  });

  it('渲染器页内求值优先：source=page 且结果透传', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(h, [[0, 0, 0]]);
    h.ctx.renderer = {
      name: 'chromium',
      ready: true,
      available: () => true,
      snapshot: async () => ({ mime: 'image/png', base64: '', width: 1, height: 1 }),
      exportGlb: async () => ({ jobId: 'j', url: '/exports/j.glb', bytes: 1 }),
      project: async () => ({
        width: W,
        height: H,
        camera: PERSP,
        source: 'page',
        points: [{ px: [640, 360], depth: 10, in_view: true }],
      }),
    } as any;
    const { body } = await call(
      h,
      'camera.project',
      { roomId, points: [[0, 0, 0]], camera: PERSP, width: W, height: H },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.source).toBe('page');
    expect(body.result.points[0].px).toEqual([640, 360]);
  });

  it('空 points 报 E_INVALID_PARAMS，未知房间报 E_ROOM_NOT_FOUND', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(h, [[0, 0, 0]]);
    const empty = await call(h, 'camera.project', { roomId, points: [], camera: PERSP }, roomId);
    expect(codeOf(empty.body)).toBe('E_INVALID_PARAMS');
    const noRoom = await call(
      h,
      'camera.project',
      { roomId: 'r_00000000', points: [[0, 0, 0]] },
      'r_00000000',
    );
    expect(codeOf(noRoom.body)).toBe('E_ROOM_NOT_FOUND');
  });
});

describe('camera.unproject：像素 → 世界（往返 ≤1e-6）', () => {
  it('project → unproject 往返还原原点', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(
      h,
      ANCHORS.map(([, p]) => p),
    );
    const inView = ANCHORS.slice(0, 4).map(([, p]) => p);
    const shot = await call(
      h,
      'camera.project',
      { roomId, points: inView, camera: PERSP, width: W, height: H },
      roomId,
    );
    const px = shot.body.result.points.map((o: any) => o.px);
    const depth = shot.body.result.points.map((o: any) => o.depth);
    const { body } = await call(
      h,
      'camera.unproject',
      { roomId, points: px, depth, camera: PERSP, width: W, height: H },
      roomId,
    );
    expect(body.error).toBeUndefined();
    for (const [i, world] of inView.entries()) {
      expect(body.result.points[i].p[0]).toBeCloseTo(world[0], 6);
      expect(body.result.points[i].p[1]).toBeCloseTo(world[1], 6);
      expect(body.result.points[i].p[2]).toBeCloseTo(world[2], 6);
    }
  });

  it('默认 depth = 机位到 target 的距离：中心像素落在 target 上', async () => {
    const h = makeHarness();
    const { roomId } = await roomWithBoxes(h, [[0, 0, 0]]);
    const { body } = await call(
      h,
      'camera.unproject',
      { roomId, points: [[640, 360]], camera: PERSP, width: W, height: H },
      roomId,
    );
    expect(body.result.points[0].p[0]).toBeCloseTo(0, 6);
    expect(body.result.points[0].p[1]).toBeCloseTo(0, 6);
    expect(body.result.points[0].p[2]).toBeCloseTo(0, 6);
  });

  it('camera.set solve：根据 fitBoxes 与 anchors 自动反解相机 Zoom 与视角，且 screenAt 按屏幕 UV 精准落点', async () => {
    const h = makeHarness();
    const { roomId, ids } = await roomWithBoxes(h, [[0.2, 0.8, 0]]);
    const heroId = ids[0]!;

    const solved = await call(
      h,
      'camera.set',
      {
        roomId,
        solve: {
          fitBoxes: [{ nodeId: heroId, rect: { u: 0.4, v: 0.3, w: 0.3 } }],
          anchors: [{ nodeId: heroId, anchor: 'top', uv: [0.55, 0.3] }],
        },
      },
      roomId,
    );
    expect(solved.body.error).toBeUndefined();
    expect(solved.body.result.solved.rmsePx).toBeLessThan(25);

    // 使用 screenAt 在当前相机画面左侧 u=0.1, v=0.45, depth=20m 处创建一个纪念碑节点
    const monument = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        name: 'monument-in-view',
        shape: 'box',
        size: [1, 1, 1],
        screenAt: { u: 0.1, v: 0.45, depth: 20 },
      },
      roomId,
    );
    expect(monument.body.error).toBeUndefined();
    const monId = monument.body.result.nodeId;

    // 投影验证该纪念碑中心严格落在屏幕 u=0.1, v=0.45 (即 128px, 324px)
    const nodeRes = await call(h, 'node.get', { roomId, nodeId: monId }, roomId);
    const monP = nodeRes.body.result.transform.p;
    const proj = await call(
      h,
      'camera.project',
      { roomId, points: [monP], width: 1280, height: 720 },
      roomId,
    );
    expect(proj.body.result.points[0].px[0]).toBeCloseTo(1280 * 0.1, 1);
    expect(proj.body.result.points[0].px[1]).toBeCloseTo(720 * 0.45, 1);
  });
});
