import type { SculptMesh, Vec3 } from './sculpt';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-8 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

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

function tube(mesh: SculptMesh, points: Vec3[], r0: number, r1: number, radial = 6): number {
  const start = mesh.positions.length / 3;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    const radius = r0 + (r1 - r0) * t;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    const tangent = unit(sub(next, prev));
    let side = cross(tangent, [0, 1, 0]);
    if (len(side) < 1e-4) side = [1, 0, 0];
    side = unit(side);
    const up = unit(cross(side, tangent));
    for (let j = 0; j < radial; j += 1) {
      const a = (j / radial) * Math.PI * 2;
      const nrm = unit(add(mul(side, Math.cos(a)), mul(up, Math.sin(a))));
      const p = add(points[i]!, mul(nrm, radius));
      mesh.positions.push(p[0], p[1], p[2]);
      mesh.normals.push(nrm[0], nrm[1], nrm[2]);
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const j2 = (j + 1) % radial;
      const a = start + i * radial + j;
      const b = start + i * radial + j2;
      const c = start + (i + 1) * radial + j2;
      const d = start + (i + 1) * radial + j;
      mesh.indices.push(a, d, b, b, d, c);
    }
  }
  return start;
}

function bridge(mesh: SculptMesh, a: number, b: number, radial: number): void {
  for (let j = 0; j < radial; j += 1) {
    const j2 = (j + 1) % radial;
    mesh.indices.push(a + j, b + j, b + j2);
  }
}

export interface TreeMesh extends SculptMesh {
  trunkRadius: number;
  tipRadius: number;
}

export function treeMesh(spec: {
  height: number;
  spread: number;
  levels: number;
  seed: number;
  style?: 'round' | 'column';
}): TreeMesh {
  const radial = 6;
  const trunkRadius = Math.max(0.04, spec.height * 0.045);
  const tipRadius = trunkRadius * (spec.style === 'column' ? 0.5 : 0.28);
  const mesh: SculptMesh = {
    positions: [],
    normals: [],
    indices: [],
    bbox: { min: [0, 0, 0], max: [0, 0, 0] },
  };
  const steps = 5;
  const trunk: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) trunk.push([0, (spec.height * i) / steps, 0]);
  const trunkStart = tube(mesh, trunk, trunkRadius, tipRadius, radial);
  const random = rng(spec.seed);
  const levels = Math.max(1, spec.levels);
  for (let level = 1; level <= levels; level += 1) {
    const y = spec.height * (0.35 + (0.5 * level) / levels);
    const ring = Math.round((y / spec.height) * steps);
    const count = 3;
    for (let b = 0; b < count; b += 1) {
      const ang = (b / count) * Math.PI * 2 + random() * 0.4;
      const reach = spec.spread * (1.05 - level / (levels + 1));
      const lift = spec.height * 0.18 * (spec.style === 'column' ? 0.35 : 1);
      const origin: Vec3 = [0, y, 0];
      const tip: Vec3 = [Math.cos(ang) * reach, y + lift, Math.sin(ang) * reach];
      const mid: Vec3 = [
        (origin[0] + tip[0]) / 2,
        (origin[1] + tip[1]) / 2 + lift * 0.2,
        (origin[2] + tip[2]) / 2,
      ];
      const branch = tube(mesh, [origin, mid, tip], trunkRadius * 0.45, tipRadius, radial);
      bridge(mesh, trunkStart + ring * radial, branch, radial);
    }
  }
  mesh.bbox = bboxOf(mesh.positions);
  return { ...mesh, trunkRadius, tipRadius };
}
