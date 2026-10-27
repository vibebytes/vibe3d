import { AppError } from '@vibebyte/vibe3d-protocol';

export type Vec3 = [number, number, number];

export interface TubeSpec {
  points: Vec3[];
  radius: number | number[];
  radiusEnd?: number;
  segments?: number;
  radialSegments?: number;
  closed?: boolean;
}

export interface TubeMesh {
  positions: number[];
  indices: number[];
  bbox: { min: Vec3; max: Vec3 };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  if (l < 1e-12) return [1, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
};

function crPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    out[i] =
      0.5 *
      (2 * p1[i]! +
        (-p0[i]! + p2[i]!) * t +
        (2 * p0[i]! - 5 * p1[i]! + 4 * p2[i]! - p3[i]!) * t2 +
        (-p0[i]! + 3 * p1[i]! - 3 * p2[i]! + p3[i]!) * t3);
  }
  return out;
}

function crTangent(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    out[i] =
      0.5 *
      ((-p0[i]! + p2[i]!) +
        2 * (2 * p0[i]! - 5 * p1[i]! + 4 * p2[i]! - p3[i]!) * t +
        3 * (-p0[i]! + 3 * p1[i]! - 3 * p2[i]! + p3[i]!) * t * t);
  }
  return out;
}

function crScalar(r0: number, r1: number, r2: number, r3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * r1 +
      (-r0 + r2) * t +
      (2 * r0 - 5 * r1 + 4 * r2 - r3) * t2 +
      (-r0 + 3 * r1 - 3 * r2 + r3) * t3)
  );
}

export function tubeMesh(spec: TubeSpec): TubeMesh {
  const pts = spec.points;
  const n = pts.length;
  if (n < 2) throw new AppError('E_INVALID_PARAMS', 'tube 至少需要 2 个点');
  if (!Array.isArray(spec.radius) && !(spec.radius > 0))
    throw new AppError('E_INVALID_PARAMS', 'tube 的 radius 必须大于 0');
  const radii = Array.isArray(spec.radius) ? spec.radius : null;
  if (radii) {
    if (radii.length !== n)
      throw new AppError(
        'E_INVALID_PARAMS',
        `tube 的 radius 数组长度 (${radii.length}) 必须与 points 数量 (${n}) 一致`,
      );
    if (radii.some((r) => !(r > 0)))
      throw new AppError('E_INVALID_PARAMS', 'tube 的 radius 数组每项都必须大于 0');
    if (spec.radiusEnd !== undefined)
      throw new AppError(
        'E_INVALID_PARAMS',
        'tube 的 radiusEnd 只在 radius 为单值时可用；逐点收束请直接写 radius 数组的首尾值',
      );
  }
  const closed = spec.closed ?? false;
  if (closed && n < 3) throw new AppError('E_INVALID_PARAMS', 'closed tube 至少需要 3 个点');

  let spread = 0;
  for (const p of pts) spread = Math.max(spread, len(sub(p, pts[0]!)));
  if (spread < 1e-9) throw new AppError('E_INVALID_PARAMS', 'tube 的 points 不能全部重合');

  const segments = Math.max(1, Math.round(spec.segments ?? 24));
  const radial = Math.max(3, Math.round(spec.radialSegments ?? 8));
  const ringCount = closed ? segments : segments + 1;
  const radiusStart = Array.isArray(spec.radius) ? 0 : spec.radius;
  const radiusEnd = spec.radiusEnd ?? radiusStart;

  const at = (i: number): Vec3 => {
    const idx = closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
    return pts[idx]!;
  };
  const radiusAt = (i: number): number => {
    const idx = closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
    return radii![idx]!;
  };

  const ringPoints = (k: number): { center: Vec3; tangent: Vec3; radius: number } => {
    const u = closed ? (k / segments) * n : (k / segments) * (n - 1);
    const span = closed ? Math.floor(u) : Math.min(Math.floor(u), n - 2);
    const t = u - span;
    const center = crPoint(at(span - 1), at(span), at(span + 1), at(span + 2), t);
    const tangent = crTangent(at(span - 1), at(span), at(span + 1), at(span + 2), t);
    const radius = radii
      ? Math.max(1e-6, crScalar(radiusAt(span - 1), radiusAt(span), radiusAt(span + 1), radiusAt(span + 2), t))
      : radiusStart + (radiusEnd - radiusStart) * (closed ? 0 : k / segments);
    return { center, tangent, radius };
  };

  const positions: number[] = [];
  const indices: number[] = [];
  let normal: Vec3 | null = null;
  let prevTangent: Vec3 = [0, 1, 0];

  for (let k = 0; k < ringCount; k += 1) {
    const ring = ringPoints(k);
    const tangent = unit(ring.tangent);
    if (!normal) {
      const ref: Vec3 = Math.abs(tangent[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      normal = unit(cross(ref, tangent));
    } else {
      const projected = sub(normal, [
        tangent[0] * dot(normal, tangent),
        tangent[1] * dot(normal, tangent),
        tangent[2] * dot(normal, tangent),
      ]);
      normal = len(projected) < 1e-8 ? unit(cross(prevTangent, tangent)) : unit(projected);
      if (len(normal) < 1e-8) normal = unit(cross([0, 1, 0], tangent));
    }
    const binormal = unit(cross(tangent, normal));
    prevTangent = tangent;
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a) * ring.radius;
      const sa = Math.sin(a) * ring.radius;
      positions.push(
        ring.center[0] + normal[0] * ca + binormal[0] * sa,
        ring.center[1] + normal[1] * ca + binormal[1] * sa,
        ring.center[2] + normal[2] * ca + binormal[2] * sa,
      );
    }
  }

  const stride = radial + 1;
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % ringCount;
    for (let j = 0; j < radial; j += 1) {
      const a = i * stride + j;
      const b = next * stride + j;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const v = positions[i + axis]!;
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }

  return { positions, indices, bbox: { min, max } };
}
