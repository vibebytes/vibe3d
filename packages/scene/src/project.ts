import type { CameraState, SceneDoc } from '@vibebyte/vibe3d-protocol';
import { nodeBounds, worldMatrix, worldPointToLocal } from './frame';

type Vec3 = [number, number, number];

const EPS = 1e-9;

export interface ProjectedPoint {
  px: [number, number];
  depth: number;
  in_view: boolean;
}

export interface UnprojectedPoint {
  p: Vec3;
  in_view: boolean;
}

export interface ProjectOptions {
  points: Vec3[];
  camera?: CameraState;
  width?: number;
  height?: number;
}

export interface UnprojectOptions {
  points: [number, number][];
  depth?: number[];
  camera?: CameraState;
  width?: number;
  height?: number;
}

export interface ProjectResult {
  width: number;
  height: number;
  camera: CameraState;
  points: ProjectedPoint[];
}

export interface UnprojectResult {
  width: number;
  height: number;
  camera: CameraState;
  points: UnprojectedPoint[];
}

export interface SolveAnchor {
  p?: Vec3;
  nodeId?: string;
  anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  uv: [number, number];
  weight?: number;
}

export interface SolveFitBox {
  nodeId: string;
  rect: {
    u: number;
    v: number;
    w?: number;
    h?: number;
  };
  weight?: number;
}

export interface SolveCameraOptions {
  anchors?: readonly SolveAnchor[];
  fitBoxes?: readonly SolveFitBox[];
  width?: number;
  height?: number;
  fixFov?: boolean;
}

export interface SolveCameraResult {
  camera: CameraState;
  rmsePx: number;
  iterations: number;
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < EPS ? [0, 0, -1] : [v[0] / len, v[1] / len, v[2] / len];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface CameraBasis {
  camera: CameraState;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  halfW: number;
  halfH: number;
  aspect: number;
}

export function cameraBasis(camera: CameraState, width: number, height: number): CameraBasis {
  const aspect = width / height;
  const forward = norm(sub(camera.target, camera.p));
  let right = cross(forward, [0, 1, 0]);
  right = Math.hypot(right[0], right[1], right[2]) < 1e-6 ? [1, 0, 0] : norm(right);
  const up = cross(right, forward);
  const halfH =
    camera.mode === 'ortho' ? 1 / camera.zoom : Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
  return { camera, forward, right, up, halfW: halfH * aspect, halfH, aspect };
}

export function projectPoints(doc: SceneDoc, opts: ProjectOptions): ProjectResult {
  const camera = opts.camera ?? doc.camera;
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const basis = cameraBasis(camera, width, height);
  const points = opts.points.map((world) => {
    const d = sub(world, camera.p);
    const xc = dot(d, basis.right);
    const yc = dot(d, basis.up);
    const zc = dot(d, basis.forward);
    let ndcX: number;
    let ndcY: number;
    if (camera.mode === 'ortho' || zc > EPS) {
      ndcX = camera.mode === 'ortho' ? xc / basis.halfW : xc / (zc * basis.halfW);
      ndcY = camera.mode === 'ortho' ? yc / basis.halfH : yc / (zc * basis.halfH);
    } else {
      ndcX = Number.POSITIVE_INFINITY;
      ndcY = Number.POSITIVE_INFINITY;
    }
    return {
      px: [((ndcX + 1) / 2) * width, ((1 - ndcY) / 2) * height] as [number, number],
      depth: zc,
      in_view: zc > 0 && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1,
    };
  });
  return { width, height, camera, points };
}

export function unprojectPoints(doc: SceneDoc, opts: UnprojectOptions): UnprojectResult {
  const camera = opts.camera ?? doc.camera;
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const basis = cameraBasis(camera, width, height);
  const defaultDepth = Math.hypot(
    camera.target[0] - camera.p[0],
    camera.target[1] - camera.p[1],
    camera.target[2] - camera.p[2],
  );
  const points = opts.points.map((px, i) => {
    const ndcX = (px[0] / width) * 2 - 1;
    const ndcY = 1 - (px[1] / height) * 2;
    const depth = opts.depth?.[i] ?? defaultDepth;
    let world: Vec3;
    if (camera.mode === 'ortho') {
      const origin: Vec3 = [
        camera.p[0] + basis.right[0] * ndcX * basis.halfW + basis.up[0] * ndcY * basis.halfH,
        camera.p[1] + basis.right[1] * ndcX * basis.halfW + basis.up[1] * ndcY * basis.halfH,
        camera.p[2] + basis.right[2] * ndcX * basis.halfW + basis.up[2] * ndcY * basis.halfH,
      ];
      world = [
        origin[0] + basis.forward[0] * depth,
        origin[1] + basis.forward[1] * depth,
        origin[2] + basis.forward[2] * depth,
      ];
    } else {
      const dir = norm([
        basis.forward[0] + basis.right[0] * ndcX * basis.halfW + basis.up[0] * ndcY * basis.halfH,
        basis.forward[1] + basis.right[1] * ndcX * basis.halfW + basis.up[1] * ndcY * basis.halfH,
        basis.forward[2] + basis.right[2] * ndcX * basis.halfW + basis.up[2] * ndcY * basis.halfH,
      ]);
      const cos = dot(dir, basis.forward);
      const scale = Math.abs(cos) < EPS ? 0 : depth / cos;
      world = [camera.p[0] + dir[0] * scale, camera.p[1] + dir[1] * scale, camera.p[2] + dir[2] * scale];
    }
    const inView = px[0] >= 0 && px[0] <= width && px[1] >= 0 && px[1] <= height;
    return { p: world, in_view: inView };
  });
  return { width, height, camera, points };
}

function resolveAnchorWorld(doc: SceneDoc, a: SolveAnchor): Vec3 | null {
  if (a.p) return a.p;
  if (!a.nodeId) return null;
  const box = nodeBounds(doc, a.nodeId);
  if (!box) return null;
  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  switch (a.anchor) {
    case 'top':
      return [cx, box.max[1], cz];
    case 'bottom':
      return [cx, box.min[1], cz];
    case 'left':
      return [box.min[0], cy, cz];
    case 'right':
      return [box.max[0], cy, cz];
    default:
      return [cx, cy, cz];
  }
}

export function solveCamera(doc: SceneDoc, opts: SolveCameraOptions): SolveCameraResult {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const aspect = width / height;

  const resolvedAnchors: { p: Vec3; uv: [number, number]; weight: number }[] = [];
  for (const a of opts.anchors ?? []) {
    const p = resolveAnchorWorld(doc, a);
    if (p) resolvedAnchors.push({ p, uv: a.uv, weight: a.weight ?? 1 });
  }

  const resolvedBoxes: { corners: Vec3[]; rect: SolveFitBox['rect']; weight: number }[] = [];
  for (const b of opts.fitBoxes ?? []) {
    const box = nodeBounds(doc, b.nodeId);
    if (!box) continue;
    const corners: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
      corners.push([
        i & 1 ? box.max[0] : box.min[0],
        i & 2 ? box.max[1] : box.min[1],
        i & 4 ? box.max[2] : box.min[2],
      ]);
    }
    resolvedBoxes.push({ corners, rect: b.rect, weight: b.weight ?? 1 });
  }

  // 解析单主框初值：若提供了 fitBoxes[0]，根据其 3D 宽高与屏幕占比直接算出解析初值
  const base = structuredClone(doc.camera);
  const lookDist = Math.max(
    5,
    Math.hypot(base.target[0] - base.p[0], base.target[1] - base.p[1], base.target[2] - base.p[2]),
  );

  let params = [
    base.p[0],
    base.p[1],
    base.p[2],
    base.target[0],
    base.target[1],
    base.target[2],
    base.fov || 30,
  ];

  if (resolvedBoxes.length > 0) {
    const first = resolvedBoxes[0]!;
    const xs = first.corners.map((c) => c[0]);
    const ys = first.corners.map((c) => c[1]);
    const zs = first.corners.map((c) => c[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const spanX = Math.max(0.1, Math.max(...xs) - Math.min(...xs));
    const spanY = Math.max(0.1, Math.max(...ys) - Math.min(...ys));
    const fovDeg = opts.fixFov ? base.fov : Math.min(65, Math.max(12, base.fov || 22));
    const halfH = Math.tan((fovDeg * Math.PI) / 360);
    const halfW = halfH * aspect;
    const distFromW = first.rect.w && first.rect.w > 0.01 ? spanX / (2 * first.rect.w * halfW) : null;
    const distFromH = first.rect.h && first.rect.h > 0.01 ? spanY / (2 * first.rect.h * halfH) : null;
    const d = distFromW ?? distFromH ?? 4;
    const uCenter = first.rect.u + (first.rect.w ?? 0) / 2;
    const vTop = first.rect.v;
    const ndcX = uCenter * 2 - 1;
    const ndcYTop = 1 - vTop * 2;
    const camX = cx - ndcX * d * halfW;
    const camY = Math.max(...ys) - ndcYTop * d * halfH + 0.15;
    const camZ = cz + d;
    params = [camX, camY, camZ, camX, cy - 0.8, cz - lookDist, fovDeg];
  }

  const costOf = (x: number[]): { cost: number; count: number } => {
    const fov = Math.min(110, Math.max(8, x[6]!));
    const cam: CameraState = {
      mode: 'persp',
      p: [x[0]!, x[1]!, x[2]!],
      target: [x[3]!, x[4]!, x[5]!],
      fov,
      zoom: 1,
    };
    if (!opts.fixFov && (x[6]! < 8 || x[6]! > 110)) {
      return { cost: 1e9 + (x[6]! - fov) ** 2 * 1e6, count: 1 };
    }
    let sumSq = 0;
    let count = 0;
    if (resolvedAnchors.length > 0) {
      const pr = projectPoints(doc, {
        camera: cam,
        width,
        height,
        points: resolvedAnchors.map((a) => a.p),
      });
      for (let i = 0; i < resolvedAnchors.length; i++) {
        const a = resolvedAnchors[i]!;
        const pt = pr.points[i]!;
        if (pt.depth <= 0.05) {
          sumSq += 1e6 * a.weight;
        } else {
          const du = pt.px[0] - a.uv[0] * width;
          const dv = pt.px[1] - a.uv[1] * height;
          sumSq += (du * du + dv * dv) * a.weight;
        }
        count += 2;
      }
    }
    for (const b of resolvedBoxes) {
      const pr = projectPoints(doc, { camera: cam, width, height, points: b.corners });
      if (pr.points.some((pt) => pt.depth <= 0.05)) {
        sumSq += 1e6 * b.weight;
        count += 4;
        continue;
      }
      const us = pr.points.map((pt) => pt.px[0] / width);
      const vs = pr.points.map((pt) => pt.px[1] / height);
      const minU = Math.min(...us);
      const maxU = Math.max(...us);
      const minV = Math.min(...vs);
      const maxV = Math.max(...vs);
      const du = (minU - b.rect.u) * width;
      const dv = (minV - b.rect.v) * height;
      sumSq += (du * du + dv * dv) * b.weight;
      count += 2;
      if (b.rect.w !== undefined) {
        const dw = (maxU - minU - b.rect.w) * width;
        sumSq += dw * dw * b.weight;
        count += 1;
      }
      if (b.rect.h !== undefined) {
        const dh = (maxV - minV - b.rect.h) * height;
        sumSq += dh * dh * b.weight;
        count += 1;
      }
    }
    return { cost: sumSq, count: Math.max(1, count) };
  };

  let best = [...params];
  let bestEval = costOf(best);
  const steps = [0.8, 0.8, 1.2, 1.2, 1.2, 2.0, opts.fixFov ? 0 : 4.0];
  const dim = opts.fixFov ? 6 : 7;
  let iterations = 0;

  for (let round = 0; round < 18; round++) {
    let improved = false;
    for (let i = 0; i < dim; i++) {
      const step = steps[i]!;
      if (step < 1e-4) continue;
      for (const dir of [1, -1]) {
        const trial = [...best];
        trial[i] = best[i]! + dir * step;
        const ev = costOf(trial);
        iterations += 1;
        if (ev.cost < bestEval.cost - 1e-6) {
          best = trial;
          bestEval = ev;
          improved = true;
          break;
        }
      }
    }
    if (!improved) {
      for (let i = 0; i < dim; i++) steps[i] = steps[i]! * 0.5;
    }
  }

  const finalCam: CameraState = {
    mode: 'persp',
    p: [Math.round(best[0]! * 1e4) / 1e4, Math.round(best[1]! * 1e4) / 1e4, Math.round(best[2]! * 1e4) / 1e4],
    target: [
      Math.round(best[3]! * 1e4) / 1e4,
      Math.round(best[4]! * 1e4) / 1e4,
      Math.round(best[5]! * 1e4) / 1e4,
    ],
    fov: Math.round(Math.min(110, Math.max(8, best[6]!)) * 100) / 100,
    zoom: 1,
  };

  return {
    camera: finalCam,
    rmsePx: Math.round(Math.sqrt(bestEval.cost / bestEval.count) * 100) / 100,
    iterations,
  };
}

export interface FitRect {
  u: number;
  v: number;
  w?: number;
  h?: number;
}

export interface SolveFitTransformOptions {
  camera: CameraState;
  bbox: { min: Vec3; max: Vec3 };
  rect: FitRect;
  anchor?: 'center' | 'bottom' | 'top';
  uniform?: boolean;
  width?: number;
  height?: number;
  doc?: SceneDoc;
  parentId?: string;
  pose?: { p: Vec3; r?: Vec3; s: Vec3 };
  parent?: readonly number[];
}

export interface FitTransform {
  p: Vec3;
  s: Vec3;
  depth: number;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function parentScale(doc: SceneDoc, parentId: string): Vec3 {
  const m = worldMatrix(doc, parentId);
  if (!m) return [1, 1, 1];
  const len = (i: number) => Math.hypot(m[i]!, m[i + 1]!, m[i + 2]!) || 1;
  return [len(0), len(4), len(8)];
}

export function solveFitTransform(opts: SolveFitTransformOptions): FitTransform {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const basis = cameraBasis(opts.camera, width, height);
  const { min, max } = opts.bbox;
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const anchorLocal: Vec3 =
    opts.anchor === 'bottom'
      ? [center[0], min[1], center[2]]
      : opts.anchor === 'top'
        ? [center[0], max[1], center[2]]
        : center;
  const poseP = opts.pose?.p ?? ([0, 0, 0] as Vec3);
  const poseS = opts.pose?.s ?? ([1, 1, 1] as Vec3);
  const rot = opts.pose?.r ?? ([0, 0, 0] as Vec3);
  const frame = opts.parent;
  let s: Vec3 = [poseS[0], poseS[1], poseS[2]];
  let origin: Vec3 = [poseP[0], poseP[1], poseP[2]];

  const rotateEuler = (v: Vec3): Vec3 => {
    const [rx, ry, rz] = rot;
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const x = v[0];
    const y = v[1];
    const z = v[2];
    return [
      cy * cz * x - cy * sz * y + sy * z,
      (cx * sz + sx * sy * cz) * x + (cx * cz - sx * sy * sz) * y - sx * cy * z,
      (sx * sz - cx * sy * cz) * x + (sx * cz + cx * sy * sz) * y + cx * cy * z,
    ];
  };
  const orient = (local: Vec3, scale: Vec3): Vec3 =>
    rotateEuler([local[0] * scale[0], local[1] * scale[1], local[2] * scale[2]]);
  const toWorld = (local: Vec3, scale: Vec3, at: Vec3): Vec3 => {
    const inParent = add(orient(local, scale), at);
    if (!frame) return inParent;
    return [
      frame[0]! * inParent[0] + frame[4]! * inParent[1] + frame[8]! * inParent[2] + frame[12]!,
      frame[1]! * inParent[0] + frame[5]! * inParent[1] + frame[9]! * inParent[2] + frame[13]!,
      frame[2]! * inParent[0] + frame[6]! * inParent[1] + frame[10]! * inParent[2] + frame[14]!,
    ];
  };
  const invertLinear = (v: Vec3): Vec3 => {
    if (!frame) return v;
    const c0: Vec3 = [frame[0]!, frame[1]!, frame[2]!];
    const c1: Vec3 = [frame[4]!, frame[5]!, frame[6]!];
    const c2: Vec3 = [frame[8]!, frame[9]!, frame[10]!];
    const det = dot(c0, cross(c1, c2));
    if (Math.abs(det) < EPS) return v;
    const inv = 1 / det;
    return [dot(v, cross(c1, c2)) * inv, dot(v, cross(c2, c0)) * inv, dot(v, cross(c0, c1)) * inv];
  };
  const depth0 = dot(sub(toWorld(center, s, origin), opts.camera.p), basis.forward);

  const spanOf = (scale: Vec3, at: Vec3) => {
    const corners: Vec3[] = [];
    for (let i = 0; i < 8; i += 1) {
      corners.push(
        toWorld([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]], scale, at),
      );
    }
    const shot = projectPoints({ camera: opts.camera } as SceneDoc, {
      camera: opts.camera,
      width,
      height,
      points: corners,
    });
    const front = shot.points.filter(
      (pt) => pt.depth > EPS && Number.isFinite(pt.px[0]) && Number.isFinite(pt.px[1]),
    );
    const us = front.map((pt) => pt.px[0] / width);
    const vs = front.map((pt) => pt.px[1] / height);
    if (us.length === 0)
      return {
        minU: Number.POSITIVE_INFINITY,
        maxU: Number.NEGATIVE_INFINITY,
        minV: Number.POSITIVE_INFINITY,
        maxV: Number.NEGATIVE_INFINITY,
      };
    return {
      minU: Math.min(...us),
      maxU: Math.max(...us),
      minV: Math.min(...vs),
      maxV: Math.max(...vs),
    };
  };

  const anchorUv = (scale: Vec3, at: Vec3): [number, number] => {
    const world = toWorld(anchorLocal, scale, at);
    const shot = projectPoints({ camera: opts.camera } as SceneDoc, {
      camera: opts.camera,
      width,
      height,
      points: [world],
    });
    return [shot.points[0]!.px[0] / width, shot.points[0]!.px[1] / height];
  };

  const clampStep = (k: number) => Math.min(2, Math.max(0.5, k));
  const holdCenter = () => add(orient(center, s), origin);
  const fitScaleBinary = () => {
    const target = opts.rect.w ?? opts.rect.h;
    if (!target) return;
    const hold = holdCenter();
    const placed = (scale: number) => {
      const sc: Vec3 = [scale, scale, scale];
      return { sc, at: sub(hold, orient(center, sc)) };
    };
    const sizeOf = (scale: number) => {
      const { sc, at } = placed(scale);
      const span = spanOf(sc, at);
      const size = opts.rect.w ? span.maxU - span.minU : span.maxV - span.minV;
      return Number.isFinite(size) ? size : Number.POSITIVE_INFINITY;
    };
    let lo = 1e-4;
    let hi = Math.max(1, Math.max(s[0], s[1], s[2]));
    for (let i = 0; i < 24 && sizeOf(hi) < target; i += 1) hi *= 2;
    for (let i = 0; i < 32; i += 1) {
      const mid = (lo + hi) / 2;
      if (sizeOf(mid) > target) hi = mid;
      else lo = mid;
    }
    const next = placed((lo + hi) / 2);
    s = next.sc;
    origin = next.at;
  };
  const fitScale = () => {
    const span = spanOf(s, origin);
    const curW = span.maxU - span.minU;
    const curH = span.maxV - span.minV;
    const kx = opts.rect.w ? (Number.isFinite(curW) && curW > EPS ? clampStep(opts.rect.w / curW) : 0.5) : 1;
    const ky = opts.rect.h ? (Number.isFinite(curH) && curH > EPS ? clampStep(opts.rect.h / curH) : 0.5) : kx;
    const k = opts.uniform === false ? 1 : opts.rect.w ? kx : ky;
    const nextS: Vec3 =
      opts.uniform === false ? [s[0] * kx, s[1] * ky, s[2] * kx] : [s[0] * k, s[1] * k, s[2] * k];
    origin = add(origin, sub(orient(center, s), orient(center, nextS)));
    s = nextS;
  };
  const fitPosition = (gain: number) => {
    const span = spanOf(s, origin);
    const depth = dot(sub(toWorld(center, s, origin), opts.camera.p), basis.forward);
    if (!Number.isFinite(depth) || depth <= EPS) return;
    let du: number;
    let dv: number;
    if (opts.anchor === 'bottom' || opts.anchor === 'top') {
      const [u, v] = anchorUv(s, origin);
      const targetU = opts.rect.u + (opts.rect.w ?? span.maxU - span.minU) / 2;
      const targetV =
        opts.anchor === 'bottom' ? opts.rect.v + (opts.rect.h ?? span.maxV - span.minV) : opts.rect.v;
      du = targetU - u;
      dv = targetV - v;
    } else {
      du = opts.rect.u - span.minU;
      dv = opts.rect.v - span.minV;
    }
    if (!Number.isFinite(du) || !Number.isFinite(dv)) return;
    origin = add(
      origin,
      invertLinear(
        add(
          scaleVec(basis.right, gain * du * 2 * depth * basis.halfW),
          scaleVec(basis.up, -gain * dv * 2 * depth * basis.halfH),
        ),
      ),
    );
    const drift = dot(sub(toWorld(center, s, origin), opts.camera.p), basis.forward) - depth0;
    origin = sub(origin, invertLinear(scaleVec(basis.forward, drift)));
  };
  const scaleOnce = () => {
    if (opts.uniform === false) fitScale();
    else fitScaleBinary();
  };
  for (let i = 0; i < 6; i += 1) {
    scaleOnce();
    for (let k = 0; k < 8; k += 1) fitPosition(0.5);
  }
  scaleOnce();

  let p = origin;
  if (opts.doc && opts.parentId) {
    const ps = parentScale(opts.doc, opts.parentId);
    p = worldPointToLocal(opts.doc, opts.parentId, p);
    s = [s[0] / ps[0], s[1] / ps[1], s[2] / ps[2]];
  }
  return { p, s, depth: depth0 };
}
