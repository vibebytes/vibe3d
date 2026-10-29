import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const W = 1280;
const H = 720;
const CAM = {
  mode: 'persp' as const,
  p: [0, 2, 18] as [number, number, number],
  target: [0, 1, -6] as [number, number, number],
  fov: 32,
  zoom: 1,
};

const FRAMES = [
  {
    name: '人',
    p: [0, 1, 2],
    size: [0.6, 1.8, 0.4],
    rect: { u: 0.42, v: 0.28, w: 0.12, h: 0.62 },
    anchor: 'bottom' as const,
  },
  {
    name: '纪念碑',
    p: [-3, 1.2, -2],
    size: [1.2, 2.4, 1.2],
    rect: { u: 0.06, v: 0.22, w: 0.14, h: 0.4 },
    anchor: 'bottom' as const,
  },
  {
    name: '树',
    p: [2.4, 1.6, -1],
    size: [1.4, 3.2, 1.4],
    rect: { u: 0.68, v: 0.16, w: 0.16, h: 0.52 },
    anchor: 'bottom' as const,
  },
  {
    name: '主楼',
    p: [0.4, 6, -16],
    size: [8, 12, 3],
    rect: { u: 0.3, v: 0.04, w: 0.42, h: 0.34 },
    anchor: 'center' as const,
  },
];

async function rocky(h: Harness): Promise<{ roomId: string; ids: Record<string, string> }> {
  const created = await call(h, 'room.create', { name: 'rocky-fixture' });
  const roomId = created.body.result.roomId as string;
  await call(h, 'camera.set', { roomId, camera: CAM }, roomId);
  const ids: Record<string, string> = {};
  for (const frame of FRAMES) {
    const node = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', name: frame.name, shape: 'box', size: frame.size, transform: { p: frame.p } },
      roomId,
    );
    ids[frame.name] = node.body.result.nodeId as string;
    const fit = await call(
      h,
      'node.fit_screen',
      {
        roomId,
        nodeId: ids[frame.name],
        rect: frame.rect,
        anchor: frame.anchor,
        uniform: false,
        width: W,
        height: H,
      },
      roomId,
    );
    expect(fit.body.error, frame.name).toBeUndefined();
  }
  return { roomId, ids };
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

function variance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function blur(src: number[], n: number, radius: number): number[] {
  const r = Math.max(0, Math.round(radius));
  const out: number[] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = Math.min(n - 1, Math.max(0, x + dx));
          const yy = Math.min(n - 1, Math.max(0, y + dy));
          sum += src[yy * n + xx] ?? 0;
          count += 1;
        }
      }
      out.push(sum / count);
    }
  }
  return out;
}

describe('rocky fixture 四框', () => {
  it('fit_screen 后 camera.project 误差不超过画面宽的 3%', async () => {
    const h = makeHarness();
    const { roomId, ids } = await rocky(h);
    for (const frame of FRAMES) {
      const got = await call(h, 'node.get', { roomId, nodeId: ids[frame.name] }, roomId);
      const box = got.body.result.worldBbox;
      const shot = await call(
        h,
        'camera.project',
        { roomId, points: corners(box), width: W, height: H },
        roomId,
      );
      const pts = shot.body.result.points as { px: [number, number] }[];
      const us = pts.map((p) => p.px[0] / W);
      const vs = pts.map((p) => p.px[1] / H);
      const minU = Math.min(...us);
      const maxU = Math.max(...us);
      const minV = Math.min(...vs);
      const maxV = Math.max(...vs);
      expect(Math.abs(maxU - minU - frame.rect.w), frame.name).toBeLessThan(0.03);
      expect(Math.abs((minU + maxU) / 2 - (frame.rect.u + frame.rect.w / 2)), frame.name).toBeLessThan(0.03);
      expect(Math.abs(maxV - minV - frame.rect.h), frame.name).toBeLessThan(0.03);
    }
  });

  it('景深对准前景时，远景块方差更低', async () => {
    const h = makeHarness();
    const { roomId, ids } = await rocky(h);
    const stage = await call(
      h,
      'stage.set',
      { roomId, stage: { post: { dof: { fStop: 2.8, focusNode: ids['人'] } } } },
      roomId,
    );
    expect(stage.body.error).toBeUndefined();
    const depthOf = async (id: string) => {
      const got = await call(h, 'node.get', { roomId, nodeId: id }, roomId);
      const box = got.body.result.worldBbox;
      const center: [number, number, number] = [
        (box.min[0] + box.max[0]) / 2,
        (box.min[1] + box.max[1]) / 2,
        (box.min[2] + box.max[2]) / 2,
      ];
      const shot = await call(h, 'camera.project', { roomId, points: [center], width: W, height: H }, roomId);
      return shot.body.result.points[0].depth as number;
    };
    const focus = await depthOf(ids['人']!);
    const far = await depthOf(ids['主楼']!);
    const aperture = (0.02 * 8) / 2.8;
    const n = 32;
    const sharp = Array.from({ length: n * n }, (_, i) => ((i % n) + Math.floor(i / n)) % 2);
    const nearPx = blur(sharp, n, Math.abs(focus - focus) * aperture * 40);
    const farPx = blur(sharp, n, (Math.abs(far - focus) * aperture * 40) / Math.max(focus, 1));
    expect(far).toBeGreaterThan(focus + 5);
    expect(variance(farPx)).toBeLessThan(variance(nearPx));
  });
});
