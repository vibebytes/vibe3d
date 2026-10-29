export type Vec3 = [number, number, number];

export interface SculptMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  bbox: { min: Vec3; max: Vec3 };
  warning?: string;
}

const MAX_GEOMETRY = 300_000;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-8 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

function bboxOf(positions: number[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = positions[i + k]!;
      min[k] = Math.min(min[k]!, v);
      max[k] = Math.max(max[k]!, v);
    }
  }
  return { min, max };
}

function pushTri(indices: number[], a: number, b: number, c: number): void {
  indices.push(a, b, c);
}

export function latheMesh(spec: { profile: [number, number][]; segments?: number }): SculptMesh {
  const segments = Math.max(3, spec.segments ?? 16);
  const profile = spec.profile;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < profile.length; i += 1) {
    const prev = profile[Math.max(0, i - 1)]!;
    const next = profile[Math.min(profile.length - 1, i + 1)]!;
    const tr = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const nl = Math.hypot(ty, tr) || 1;
    const nr = ty / nl;
    const ny = -tr / nl;
    const [radius, y] = profile[i]!;
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      positions.push(c * radius, y, sn * radius);
      normals.push(c * nr, ny, sn * nr);
    }
  }
  for (let i = 0; i < profile.length - 1; i += 1) {
    for (let s = 0; s < segments; s += 1) {
      const s2 = (s + 1) % segments;
      const a = i * segments + s;
      const b = i * segments + s2;
      const c = (i + 1) * segments + s2;
      const d = (i + 1) * segments + s;
      pushTri(indices, a, d, b);
      pushTri(indices, b, d, c);
    }
  }
  return { positions, normals, indices, bbox: bboxOf(positions) };
}

function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function noise(p: Vec3, seed: number): number {
  const ix = Math.floor(p[0] * 6);
  const iy = Math.floor(p[1] * 6);
  const iz = Math.floor(p[2] * 6);
  return hash(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791) ^ seed) * 2 - 1;
}

export function organicMesh(spec: {
  radius: Vec3;
  seed: number;
  amplitude?: number;
  segments?: number;
  flatBottom?: boolean;
}): SculptMesh {
  const segments = Math.max(3, spec.segments ?? 12);
  const amp = spec.amplitude ?? 0.1;
  const [rx, ry, rz] = spec.radius;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const stride = segments + 1;
  for (let y = 0; y <= segments; y += 1) {
    const phi = (y / segments) * Math.PI;
    for (let x = 0; x <= segments; x += 1) {
      const theta = (x / segments) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      const base: Vec3 = [nx * rx, ny * ry, nz * rz];
      const n = unit([nx / Math.max(rx, 1e-6), ny / Math.max(ry, 1e-6), nz / Math.max(rz, 1e-6)]);
      const offset = amp === 0 ? 0 : amp * noise(base, spec.seed);
      const p = add(base, mul(n, offset));
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
    }
  }
  if (spec.flatBottom) {
    let minY = Number.POSITIVE_INFINITY;
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]!);
    for (let i = 1; i < positions.length; i += 3) positions[i] = positions[i]! - minY;
  }
  for (let y = 0; y < segments; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * stride + x;
      pushTri(indices, a, a + stride, a + 1);
      pushTri(indices, a + 1, a + stride, a + stride + 1);
    }
  }
  return { positions, normals, indices, bbox: bboxOf(positions) };
}

function roundedBox(p: Vec3, half: Vec3, radius: number): number {
  const q: Vec3 = [
    Math.abs(p[0]) - (half[0] - radius),
    Math.abs(p[1]) - (half[1] - radius),
    Math.abs(p[2]) - (half[2] - radius),
  ];
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  const inside = Math.min(Math.max(q[0], q[1], q[2]), 0);
  return outside + inside - radius;
}

function roundedNormal(p: Vec3, half: Vec3, radius: number): Vec3 {
  const e = 1e-3;
  return unit([
    roundedBox(add(p, [e, 0, 0]), half, radius) - roundedBox(add(p, [-e, 0, 0]), half, radius),
    roundedBox(add(p, [0, e, 0]), half, radius) - roundedBox(add(p, [0, -e, 0]), half, radius),
    roundedBox(add(p, [0, 0, e]), half, radius) - roundedBox(add(p, [0, 0, -e]), half, radius),
  ]);
}

function projectSurface(start: Vec3, half: Vec3, radius: number): Vec3 {
  let p = start;
  for (let i = 0; i < 16; i += 1) {
    const n = roundedNormal(p, half, radius);
    p = sub(p, mul(n, roundedBox(p, half, radius)));
  }
  return p;
}

export function bevelMesh(spec: { size: Vec3; radius: number; segments?: number }): SculptMesh {
  const segments = Math.max(2, spec.segments ?? 4);
  const half: Vec3 = [spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2];
  const radius = Math.min(spec.radius, Math.min(half[0], half[1], half[2]) * 0.49);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faces: Array<{ origin: Vec3; u: Vec3; v: Vec3; n: Vec3 }> = [
    { origin: [half[0], 0, 0], u: [0, half[1], 0], v: [0, 0, half[2]], n: [1, 0, 0] },
    { origin: [-half[0], 0, 0], u: [0, half[1], 0], v: [0, 0, -half[2]], n: [-1, 0, 0] },
    { origin: [0, half[1], 0], u: [half[0], 0, 0], v: [0, 0, half[2]], n: [0, 1, 0] },
    { origin: [0, -half[1], 0], u: [half[0], 0, 0], v: [0, 0, -half[2]], n: [0, -1, 0] },
    { origin: [0, 0, half[2]], u: [half[0], 0, 0], v: [0, half[1], 0], n: [0, 0, 1] },
    { origin: [0, 0, -half[2]], u: [-half[0], 0, 0], v: [0, half[1], 0], n: [0, 0, -1] },
  ];
  const stride = segments + 1;
  for (const face of faces) {
    const base = positions.length / 3;
    for (let iy = 0; iy <= segments; iy += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const u = (ix / segments) * 2 - 1;
        const v = (iy / segments) * 2 - 1;
        const start = add(add(face.origin, mul(face.u, u)), add(mul(face.v, v), mul(face.n, radius)));
        const p = projectSurface(start, half, radius);
        const n = roundedNormal(p, half, radius);
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      }
    }
    for (let iy = 0; iy < segments; iy += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = base + iy * stride + ix;
        pushTri(indices, a, a + stride, a + 1);
        pushTri(indices, a + 1, a + stride, a + stride + 1);
      }
    }
  }
  return { positions, normals, indices, bbox: bboxOf(positions) };
}

interface Ball {
  c: Vec3;
  r: number;
}

function ballOf(mesh: { positions: number[] }): Ball {
  const box = bboxOf(mesh.positions);
  const c: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  let r = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    r = Math.max(r, len(sub([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!], c)));
  }
  return { c, r: Math.max(r, 1e-4) };
}

function fieldAt(p: Vec3, balls: Ball[]): number {
  let sum = 0;
  for (const ball of balls) {
    const d = sub(p, ball.c);
    sum += (ball.r * ball.r) / Math.max(dot(d, d), 1e-8);
  }
  return sum;
}

function hardMerge(
  meshes: Array<{ positions: number[]; normals: number[]; indices: number[] }>,
  warning: string,
): SculptMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const mesh of meshes) {
    positions.push(...mesh.positions);
    normals.push(...mesh.normals);
    for (const index of mesh.indices) indices.push(index + offset);
    offset += mesh.positions.length / 3;
  }
  return { positions, normals, indices, bbox: bboxOf(positions), warning };
}

export function smoothMerge(
  meshes: Array<{ positions: number[]; normals: number[]; indices: number[] }>,
  opts: { resolution?: number } = {},
): SculptMesh {
  const resolution = Math.max(4, opts.resolution ?? 12);
  if ((resolution + 1) ** 3 > MAX_GEOMETRY) {
    return hardMerge(meshes, '顶点超过 300000，已退回硬合并');
  }
  const balls = meshes.map(ballOf);
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const ball of balls) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, ball.c[k]! - ball.r * 1.35);
      max[k] = Math.max(max[k]!, ball.c[k]! + ball.r * 1.35);
    }
  }
  const points = resolution + 1;
  const at = (ix: number, iy: number, iz: number): Vec3 => [
    min[0] + ((max[0] - min[0]) * ix) / resolution,
    min[1] + ((max[1] - min[1]) * iy) / resolution,
    min[2] + ((max[2] - min[2]) * iz) / resolution,
  ];
  const sample = (ix: number, iy: number, iz: number) => fieldAt(at(ix, iy, iz), balls);
  const corner = (cx: number, cy: number, cz: number, bit: number) =>
    sample(cx + (bit & 1), cy + ((bit >> 1) & 1), cz + ((bit >> 2) & 1));
  const cornerPos = (cx: number, cy: number, cz: number, bit: number) =>
    at(cx + (bit & 1), cy + ((bit >> 1) & 1), cz + ((bit >> 2) & 1));
  const edges: Array<[number, number]> = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const cellIndex = (x: number, y: number, z: number) => (x * resolution + y) * resolution + z;
  const cellVert = new Int32Array(resolution * resolution * resolution).fill(-1);
  const positions: number[] = [];
  const iso = 1;
  for (let x = 0; x < resolution; x += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let z = 0; z < resolution; z += 1) {
        const acc: Vec3 = [0, 0, 0];
        let hits = 0;
        let inside = false;
        let outside = false;
        for (const [a, b] of edges) {
          const va = corner(x, y, z, a);
          const vb = corner(x, y, z, b);
          if (va >= iso) inside = true;
          else outside = true;
          if ((va - iso) * (vb - iso) > 0) continue;
          const t = (iso - va) / (vb - va || 1e-8);
          const pa = cornerPos(x, y, z, a);
          const pb = cornerPos(x, y, z, b);
          acc[0] += pa[0] + (pb[0] - pa[0]) * t;
          acc[1] += pa[1] + (pb[1] - pa[1]) * t;
          acc[2] += pa[2] + (pb[2] - pa[2]) * t;
          hits += 1;
        }
        if (!inside || !outside || hits === 0) continue;
        cellVert[cellIndex(x, y, z)] = positions.length / 3;
        positions.push(acc[0] / hits, acc[1] / hits, acc[2] / hits);
      }
    }
  }
  const indices: number[] = [];
  const quad = (ids: Array<number | undefined>) => {
    if (ids.some((id) => id == null || id < 0)) return;
    const [a, b, c, d] = ids as number[];
    pushTri(indices, a!, b!, c!);
    pushTri(indices, a!, c!, d!);
  };
  const vert = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= resolution || y >= resolution || z >= resolution
      ? -1
      : cellVert[cellIndex(x, y, z)]!;
  for (let x = 0; x < points; x += 1) {
    for (let y = 0; y < points; y += 1) {
      for (let z = 0; z < points; z += 1) {
        if (x < resolution && (sample(x, y, z) - iso) * (sample(x + 1, y, z) - iso) < 0) {
          quad([vert(x, y - 1, z - 1), vert(x, y, z - 1), vert(x, y, z), vert(x, y - 1, z)]);
        }
        if (y < resolution && (sample(x, y, z) - iso) * (sample(x, y + 1, z) - iso) < 0) {
          quad([vert(x - 1, y, z - 1), vert(x, y, z - 1), vert(x, y, z), vert(x - 1, y, z)]);
        }
        if (z < resolution && (sample(x, y, z) - iso) * (sample(x, y, z + 1) - iso) < 0) {
          quad([vert(x - 1, y - 1, z), vert(x, y - 1, z), vert(x, y, z), vert(x - 1, y, z)]);
        }
      }
    }
  }
  const normals: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    let best = balls[0]!;
    let bestD = Number.POSITIVE_INFINITY;
    for (const ball of balls) {
      const d = len(sub(p, ball.c));
      if (d < bestD) {
        best = ball;
        bestD = d;
      }
    }
    const n = unit(sub(p, best.c));
    normals.push(n[0], n[1], n[2]);
  }
  return { positions, normals, indices, bbox: bboxOf(positions) };
}
