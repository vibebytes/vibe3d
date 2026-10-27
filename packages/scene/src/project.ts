import type { CameraState, SceneDoc } from '@vibebyte/vibe3d-protocol';

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
  const halfH = camera.mode === 'ortho' ? 1 / camera.zoom : Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
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
