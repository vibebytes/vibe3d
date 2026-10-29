import { type CameraState, type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { projectPoints, solveFitTransform } from '../src/project';

const CAM: CameraState = {
  mode: 'persp',
  p: [0, 1.5, 10],
  target: [0, 1.5, 0],
  fov: 40,
  zoom: 1,
};
const W = 1280;
const H = 720;

const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max });

function projected(camera: CameraState, b: { min: number[]; max: number[] }) {
  const corners: [number, number, number][] = [];
  for (let i = 0; i < 8; i += 1) {
    corners.push([
      i & 1 ? b.max[0]! : b.min[0]!,
      i & 2 ? b.max[1]! : b.min[1]!,
      i & 4 ? b.max[2]! : b.min[2]!,
    ]);
  }
  const shot = projectPoints({ camera } as SceneDoc, { camera, width: W, height: H, points: corners });
  const us = shot.points.map((p) => p.px[0] / W);
  const vs = shot.points.map((p) => p.px[1] / H);
  return {
    minU: Math.min(...us),
    maxU: Math.max(...us),
    minV: Math.min(...vs),
    maxV: Math.max(...vs),
  };
}

function depthOf(camera: CameraState, p: [number, number, number]) {
  const shot = projectPoints({ camera } as SceneDoc, { camera, width: W, height: H, points: [p] });
  return shot.points[0]!.depth;
}

describe('solveFitTransform', () => {
  const bbox = box([-1, 0.5, -0.4], [1, 2.5, 0.4]);

  it('均匀缩放后投影宽度与左上角贴合目标框，视线深度不变', () => {
    const before = depthOf(CAM, [0, 1.5, 0]);
    const fit = solveFitTransform({
      camera: CAM,
      bbox,
      rect: { u: 0.4, v: 0.25, w: 0.2, h: 0.45 },
      anchor: 'center',
      uniform: true,
      width: W,
      height: H,
    });
    expect(fit.depth).toBeCloseTo(before, 4);
    const moved = box(
      [
        bbox.min[0] * fit.s[0] + fit.p[0],
        bbox.min[1] * fit.s[1] + fit.p[1],
        bbox.min[2] * fit.s[2] + fit.p[2],
      ],
      [
        bbox.max[0] * fit.s[0] + fit.p[0],
        bbox.max[1] * fit.s[1] + fit.p[1],
        bbox.max[2] * fit.s[2] + fit.p[2],
      ],
    );
    const view = projected(CAM, moved);
    expect(Math.abs(view.maxU - view.minU - 0.2) * W).toBeLessThan(0.5);
    expect(Math.abs(view.minU - 0.4) * W).toBeLessThan(0.5);
    expect(Math.abs(view.minV - 0.25) * H).toBeLessThan(0.5);
    expect(fit.s[0]).toBeCloseTo(fit.s[1], 5);
    expect(fit.s[1]).toBeCloseTo(fit.s[2], 5);
  });

  it('anchor bottom 时底面中心落在框底边中点，高度贴 rect.h', () => {
    const fit = solveFitTransform({
      camera: CAM,
      bbox,
      rect: { u: 0.35, v: 0.2, w: 0.18, h: 0.4 },
      anchor: 'bottom',
      uniform: false,
      width: W,
      height: H,
    });
    const moved = box(
      [
        bbox.min[0] * fit.s[0] + fit.p[0],
        bbox.min[1] * fit.s[1] + fit.p[1],
        bbox.min[2] * fit.s[2] + fit.p[2],
      ],
      [
        bbox.max[0] * fit.s[0] + fit.p[0],
        bbox.max[1] * fit.s[1] + fit.p[1],
        bbox.max[2] * fit.s[2] + fit.p[2],
      ],
    );
    const view = projected(CAM, moved);
    expect(Math.abs(view.maxU - view.minU - 0.18) * W).toBeLessThan(0.5);
    expect(Math.abs(view.maxV - view.minV - 0.4) * H).toBeLessThan(0.5);
    const bottom: [number, number, number] = [
      (moved.min[0]! + moved.max[0]!) / 2,
      moved.min[1]!,
      (moved.min[2]! + moved.max[2]!) / 2,
    ];
    const bottomPx = projectPoints({ camera: CAM } as SceneDoc, {
      camera: CAM,
      width: W,
      height: H,
      points: [bottom],
    }).points[0]!.px;
    expect(Math.abs(bottomPx[0] / W - 0.44) * W).toBeLessThan(0.5);
    expect(Math.abs(bottomPx[1] / H - 0.6) * H).toBeLessThan(0.5);
  });

  it('父节点平移缩放时返回局部 p/s', () => {
    const doc = emptyDoc('fit');
    const parent: SceneNode = {
      id: 'n_parent01',
      kind: 'group',
      name: 'parent',
      parent: null,
      visible: true,
      transform: { p: [4, 1, -2], r: [0, 0, 0], s: [2, 2, 2] },
    };
    doc.nodes[parent.id] = parent;
    doc.roots.push(parent.id);
    const world = solveFitTransform({
      camera: CAM,
      bbox,
      rect: { u: 0.4, v: 0.3, w: 0.15 },
      width: W,
      height: H,
    });
    const local = solveFitTransform({
      camera: CAM,
      bbox,
      rect: { u: 0.4, v: 0.3, w: 0.15 },
      width: W,
      height: H,
      doc,
      parentId: parent.id,
    });
    expect(local.p[0] * 2 + 4).toBeCloseTo(world.p[0], 4);
    expect(local.p[1] * 2 + 1).toBeCloseTo(world.p[1], 4);
    expect(local.p[2] * 2 - 2).toBeCloseTo(world.p[2], 4);
    expect(local.s[0] * 2).toBeCloseTo(world.s[0], 4);
    expect(local.s[1] * 2).toBeCloseTo(world.s[1], 4);
    expect(local.s[2] * 2).toBeCloseTo(world.s[2], 4);
  });

  it('绕 Y 轴 45° 后按朝向后的角点贴合目标宽度', () => {
    const thin = box([-1, -0.5, -0.05], [1, 0.5, 0.05]);
    const yawAngle = Math.PI / 4;
    const fit = solveFitTransform({
      camera: CAM,
      bbox: thin,
      pose: { p: [0, 1.5, 0], r: [0, yawAngle, 0], s: [1, 1, 1] },
      rect: { u: 0.4, v: 0.3, w: 0.12 },
      width: W,
      height: H,
    });
    const c = Math.cos(yawAngle);
    const sn = Math.sin(yawAngle);
    const yaw = (x: number, y: number, z: number): [number, number, number] => [
      c * x + sn * z,
      y,
      -sn * x + c * z,
    ];
    const corners: [number, number, number][] = [];
    for (let i = 0; i < 8; i += 1) {
      const local: [number, number, number] = [
        (i & 1 ? thin.max[0] : thin.min[0]) * fit.s[0],
        (i & 2 ? thin.max[1] : thin.min[1]) * fit.s[1],
        (i & 4 ? thin.max[2] : thin.min[2]) * fit.s[2],
      ];
      const turned = yaw(local[0], local[1], local[2]);
      corners.push([turned[0] + fit.p[0], turned[1] + fit.p[1], turned[2] + fit.p[2]]);
    }
    const shot = projectPoints({ camera: CAM } as SceneDoc, {
      camera: CAM,
      width: W,
      height: H,
      points: corners,
    });
    const us = shot.points.map((p) => p.px[0] / W);
    expect(Math.abs(Math.max(...us) - Math.min(...us) - 0.12) * W).toBeLessThan(0.5);
    expect(Math.abs(Math.min(...us) - 0.4) * W).toBeLessThan(0.5);
    expect(fit.depth).toBeCloseTo(depthOf(CAM, [0, 1.5, 0]), 4);
  });
});
