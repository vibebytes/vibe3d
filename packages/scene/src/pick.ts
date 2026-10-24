import type { CameraState, SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { nodeOwnBounds } from './frame';

type Vec3 = [number, number, number];

export interface PickRay {
  origin: Vec3;
  direction: Vec3;
}

export interface PickHit {
  nodeId: string;
  distance: number;
  hitPoint: Vec3;
}

export interface PickOptions {
  ray?: PickRay;
  point?: [number, number];
  width?: number;
  height?: number;
  camera?: CameraState;
  maxDistance?: number;
  tolerance?: number;
  limit?: number;
}

export interface PickResult {
  nodeId: string | null;
  hitPoint: Vec3 | null;
  distance: number | null;
  candidates: PickHit[];
  ray: PickRay;
}

const DEFAULT_LIMIT = 5;
const EPS = 1e-9;

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

function screenRay(doc: SceneDoc, opts: PickOptions): PickRay {
  const camera = opts.camera ?? doc.camera;
  const [px, py] = opts.point ?? [0.5, 0.5];
  const ndcX = px * 2 - 1;
  const ndcY = 1 - py * 2;
  const aspect = (opts.width ?? 1280) / (opts.height ?? 720);
  const forward = norm(sub(camera.target, camera.p));
  let right = cross(forward, [0, 1, 0]);
  right = Math.hypot(right[0], right[1], right[2]) < 1e-6 ? [1, 0, 0] : norm(right);
  const up = cross(right, forward);
  if (camera.mode === 'ortho') {
    const halfH = 1 / camera.zoom;
    const halfW = halfH * aspect;
    return {
      origin: [
        camera.p[0] + right[0] * ndcX * halfW + up[0] * ndcY * halfH,
        camera.p[1] + right[1] * ndcX * halfW + up[1] * ndcY * halfH,
        camera.p[2] + right[2] * ndcX * halfW + up[2] * ndcY * halfH,
      ],
      direction: forward,
    };
  }
  const halfH = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
  const halfW = halfH * aspect;
  return {
    origin: [...camera.p],
    direction: norm([
      forward[0] + right[0] * ndcX * halfW + up[0] * ndcY * halfH,
      forward[1] + right[1] * ndcX * halfW + up[1] * ndcY * halfH,
      forward[2] + right[2] * ndcX * halfW + up[2] * ndcY * halfH,
    ]),
  };
}

function slab(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3, maxDistance: number): number | null {
  let tMin = 0;
  let tMax = maxDistance;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]!) < EPS) {
      if (origin[i]! < min[i]! || origin[i]! > max[i]!) return null;
      continue;
    }
    let t1 = (min[i]! - origin[i]!) / dir[i]!;
    let t2 = (max[i]! - origin[i]!) / dir[i]!;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

function visibleInHierarchy(doc: SceneDoc, id: string): boolean {
  const seen = new Set<string>();
  let current: string | null = id;
  while (current) {
    if (seen.has(current)) return false;
    seen.add(current);
    const node: SceneNode | undefined = doc.nodes[current];
    if (!node?.visible) return false;
    current = node.parent;
  }
  return true;
}

export function pickNode(doc: SceneDoc, opts: PickOptions = {}): PickResult {
  const ray = opts.ray
    ? { origin: [...opts.ray.origin] as Vec3, direction: norm(opts.ray.direction) }
    : screenRay(doc, opts);
  const maxDistance = opts.maxDistance ?? Number.POSITIVE_INFINITY;
  const tolerance = opts.tolerance ?? 0;
  const limit = Math.min(50, Math.max(1, opts.limit ?? DEFAULT_LIMIT));
  const hits: PickHit[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (node.kind !== 'mesh' && node.kind !== 'model') continue;
    if (!visibleInHierarchy(doc, node.id)) continue;
    const box = nodeOwnBounds(doc, node.id);
    if (!box) continue;
    const min: Vec3 = [box.min[0] - tolerance, box.min[1] - tolerance, box.min[2] - tolerance];
    const max: Vec3 = [box.max[0] + tolerance, box.max[1] + tolerance, box.max[2] + tolerance];
    const distance = slab(ray.origin, ray.direction, min, max, maxDistance);
    if (distance === null) continue;
    hits.push({
      nodeId: node.id,
      distance,
      hitPoint: [
        ray.origin[0] + ray.direction[0] * distance,
        ray.origin[1] + ray.direction[1] * distance,
        ray.origin[2] + ray.direction[2] * distance,
      ],
    });
  }
  hits.sort((a, b) => (a.distance === b.distance ? (a.nodeId < b.nodeId ? -1 : 1) : a.distance - b.distance));
  const top = hits[0] ?? null;
  return {
    nodeId: top?.nodeId ?? null,
    hitPoint: top?.hitPoint ?? null,
    distance: top?.distance ?? null,
    candidates: hits.slice(0, limit),
    ray,
  };
}
