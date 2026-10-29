import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: { error?: { data?: { code?: string }; code?: string } }): string | undefined =>
  body?.error?.data?.code ?? body?.error?.code;

const CAM = {
  mode: 'persp' as const,
  p: [0, 0, 10] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 40,
  zoom: 1,
};
const W = 1280;
const H = 720;

async function roomWithBox(h: Harness): Promise<{ roomId: string; nodeId: string }> {
  const { body } = await call(h, 'room.create', { name: 'fit' });
  const roomId = body.result.roomId as string;
  await call(h, 'camera.set', { roomId, camera: CAM }, roomId);
  const created = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name: '牌',
      shape: 'box',
      size: [2, 2, 0.4],
      transform: { p: [0, 0, 2] },
    },
    roomId,
  );
  return { roomId, nodeId: created.body.result.nodeId as string };
}

function corners(box: { min: number[]; max: number[] }): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 8; i += 1) {
    out.push([
      i & 1 ? box.max[0]! : box.min[0]!,
      i & 2 ? box.max[1]! : box.min[1]!,
      i & 4 ? box.max[2]! : box.min[2]!,
    ]);
  }
  return out;
}

describe('node.fit_screen', () => {
  it('按当前相机把节点写进目标框，视线深度不变', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await roomWithBox(h);
    const before = await call(
      h,
      'camera.project',
      { roomId, points: [[0, 0, 2]], camera: CAM, width: W, height: H },
      roomId,
    );
    const depthBefore = before.body.result.points[0].depth as number;
    const fit = await call(
      h,
      'node.fit_screen',
      {
        roomId,
        nodeId,
        rect: { u: 0.3, v: 0.22, w: 0.25, h: 0.4 },
        anchor: 'center',
        uniform: true,
        width: W,
        height: H,
      },
      roomId,
    );
    expect(fit.body.error).toBeUndefined();
    const got = await call(h, 'node.get', { roomId, nodeId }, roomId);
    const box = got.body.result.worldBbox;
    const center: [number, number, number] = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    const shot = await call(
      h,
      'camera.project',
      { roomId, points: [...corners(box), center], width: W, height: H },
      roomId,
    );
    const pts = shot.body.result.points as { px: [number, number]; depth: number }[];
    const us = pts.slice(0, 8).map((p) => p.px[0] / W);
    const vs = pts.slice(0, 8).map((p) => p.px[1] / H);
    expect(Math.abs(Math.max(...us) - Math.min(...us) - 0.25) * W).toBeLessThan(0.5);
    expect(Math.abs(Math.min(...us) - 0.3) * W).toBeLessThan(0.5);
    expect(Math.abs(Math.min(...vs) - 0.22) * H).toBeLessThan(0.5);
    const origin = pts[8]!;
    expect(origin.depth).toBeCloseTo(depthBefore, 3);
    expect(got.body.result.transform.p[2]).toBeCloseTo(2, 3);
  });

  it('缺 nodeId 或矩形非法时 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await roomWithBox(h);
    const missing = await call(h, 'node.fit_screen', { roomId, rect: { u: 0.2, v: 0.2, w: 0.2 } }, roomId);
    expect(codeOf(missing.body)).toBe('E_INVALID_PARAMS');
    const bad = await call(h, 'node.fit_screen', { roomId, nodeId, rect: { u: 0.2, v: 0.2, w: 0 } }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });

  it('绕 Y 轴 45° 的节点按朝向后的投影贴合，旋转保留', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: 'fit-rot' });
    const roomId = created.result.roomId as string;
    await call(h, 'camera.set', { roomId, camera: CAM }, roomId);
    const node = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        name: '转牌',
        shape: 'box',
        size: [2, 1, 0.2],
        transform: { p: [0, 0, 0], r: [0, Math.PI / 4, 0] },
      },
      roomId,
    );
    const nodeId = node.body.result.nodeId as string;
    const fit = await call(
      h,
      'node.fit_screen',
      {
        roomId,
        nodeId,
        rect: { u: 0.35, v: 0.3, w: 0.2 },
        anchor: 'center',
        uniform: true,
        width: W,
        height: H,
      },
      roomId,
    );
    expect(fit.body.error).toBeUndefined();
    const got = await call(h, 'node.get', { roomId, nodeId }, roomId);
    expect(got.body.result.transform.r[1]).toBeCloseTo(Math.PI / 4, 4);
    const tr = got.body.result.transform as { p: number[]; s: number[] };
    const c = Math.cos(Math.PI / 4);
    const sn = Math.sin(Math.PI / 4);
    const half: [number, number, number] = [1, 0.5, 0.1];
    const oriented: [number, number, number][] = [];
    for (let i = 0; i < 8; i += 1) {
      const x = (i & 1 ? half[0] : -half[0]) * tr.s[0]!;
      const y = (i & 2 ? half[1] : -half[1]) * tr.s[1]!;
      const z = (i & 4 ? half[2] : -half[2]) * tr.s[2]!;
      oriented.push([c * x + sn * z + tr.p[0]!, y + tr.p[1]!, -sn * x + c * z + tr.p[2]!]);
    }
    const shot = await call(h, 'camera.project', { roomId, points: oriented, width: W, height: H }, roomId);
    const us = (shot.body.result.points as { px: [number, number] }[]).map((p) => p.px[0] / W);
    expect(Math.abs(Math.max(...us) - Math.min(...us) - 0.2) * W).toBeLessThan(0.5);
    expect(Math.abs(Math.min(...us) - 0.35) * W).toBeLessThan(0.5);
  });
});
