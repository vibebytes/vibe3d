import { type SculptMesh, latheMesh } from './sculpt';
import { smoothMerge } from './sculpt';

export interface Mannequin {
  body: SculptMesh;
  cloth: SculptMesh;
  landmarks: { head: number; shoulder: number; hip: number };
}

const HEAD = 1.66;
const SHOULDER = 1.46;
const HIP = 0.98;

function sphere(center: [number, number, number], radius: number, seg = 6): SculptMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const stride = seg + 1;
  for (let y = 0; y <= seg; y += 1) {
    const phi = (y / seg) * Math.PI;
    for (let x = 0; x <= seg; x += 1) {
      const theta = (x / seg) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(center[0] + nx * radius, center[1] + ny * radius, center[2] + nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < seg; y += 1) {
    for (let x = 0; x < seg; x += 1) {
      const a = y * stride + x;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const min: [number, number, number] = [center[0] - radius, center[1] - radius, center[2] - radius];
  const max: [number, number, number] = [center[0] + radius, center[1] + radius, center[2] + radius];
  return { positions, normals, indices, bbox: { min, max } };
}

function concat(parts: SculptMesh[]): SculptMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    positions.push(...part.positions);
    normals.push(...part.normals);
    for (const index of part.indices) indices.push(index + offset);
    offset += part.positions.length / 3;
  }
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const part of parts) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, part.bbox.min[k]!);
      max[k] = Math.max(max[k]!, part.bbox.max[k]!);
    }
  }
  return { positions, normals, indices, bbox: { min, max } };
}

function capsule(a: [number, number, number], b: [number, number, number], radius: number): SculptMesh {
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return concat([sphere(a, radius, 4), sphere(mid, radius * 0.92, 4), sphere(b, radius, 4)]);
}

export function mannequinMesh(spec: { pose?: 'jog_away' | 'stand'; seed?: number } = {}): Mannequin {
  const jog = spec.pose === 'jog_away';
  const torso = latheMesh({
    profile: [
      [0.16, HIP],
      [0.2, 1.15],
      [0.22, 1.32],
      [0.16, SHOULDER],
    ],
    segments: 8,
  });
  const shoulders = concat([sphere([-0.2, SHOULDER, 0], 0.09, 5), sphere([0.2, SHOULDER, 0], 0.09, 5)]);
  const fused = smoothMerge([torso, shoulders], { resolution: 6 });
  const head = sphere([0, HEAD, jog ? 0.04 : 0], 0.12, 6);
  const arm = (side: number, forward: number) =>
    capsule([side * 0.22, SHOULDER, 0], [side * 0.28, 1.05, forward], 0.05);
  const leg = (side: number, forward: number) =>
    capsule([side * 0.09, HIP, 0], [side * 0.1, 0.05, forward], 0.07);
  const body = concat([
    fused.warning ? torso : fused,
    head,
    arm(-1, jog ? -0.22 : 0),
    arm(1, jog ? 0.18 : 0),
    leg(-1, jog ? 0.28 : 0),
    leg(1, jog ? -0.12 : 0),
  ]);
  const cloth = latheMesh({
    profile: [
      [0.19, HIP + 0.04],
      [0.24, 1.16],
      [0.25, 1.3],
      [0.18, SHOULDER - 0.06],
    ],
    segments: 8,
  });
  return { body, cloth, landmarks: { head: HEAD, shoulder: SHOULDER, hip: HIP } };
}
