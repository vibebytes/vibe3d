export type Box = { min: [number, number, number]; max: [number, number, number] };

export type BooleanOp = 'subtract' | 'union' | 'intersect';

const EPS = 1e-6;

const alive = (b: Box): boolean =>
  b.max[0] - b.min[0] > EPS && b.max[1] - b.min[1] > EPS && b.max[2] - b.min[2] > EPS;

export function boxFromCenter(center: readonly number[], size: readonly number[]): Box {
  const [cx = 0, cy = 0, cz = 0] = center;
  const [sx = 0, sy = 0, sz = 0] = size;
  const half: [number, number, number] = [Math.abs(sx) / 2, Math.abs(sy) / 2, Math.abs(sz) / 2];
  return {
    min: [cx - half[0], cy - half[1], cz - half[2]],
    max: [cx + half[0], cy + half[1], cz + half[2]],
  };
}

export function boxUnion(a: Box, b: Box): Box {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export function boxIntersect(a: Box, b: Box): Box | null {
  const out: Box = {
    min: [Math.max(a.min[0], b.min[0]), Math.max(a.min[1], b.min[1]), Math.max(a.min[2], b.min[2])],
    max: [Math.min(a.max[0], b.max[0]), Math.min(a.max[1], b.max[1]), Math.min(a.max[2], b.max[2])],
  };
  return alive(out) ? out : null;
}

export function subtractBox(target: Box, tool: Box): Box[] {
  const hit = boxIntersect(target, tool);
  if (!hit) return [target];
  const slab = (min: [number, number, number], max: [number, number, number]): Box | null => {
    const b: Box = { min, max };
    return alive(b) ? b : null;
  };
  const out: Box[] = [];
  const push = (b: Box | null) => {
    if (b) out.push(b);
  };

  push(slab([target.min[0], target.min[1], target.min[2]], [hit.min[0], target.max[1], target.max[2]]));
  push(slab([hit.max[0], target.min[1], target.min[2]], [target.max[0], target.max[1], target.max[2]]));

  const x0 = hit.min[0];
  const x1 = hit.max[0];
  push(slab([x0, target.min[1], target.min[2]], [x1, hit.min[1], target.max[2]]));
  push(slab([x0, hit.max[1], target.min[2]], [x1, target.max[1], target.max[2]]));

  const y0 = hit.min[1];
  const y1 = hit.max[1];
  push(slab([x0, y0, target.min[2]], [x1, y1, hit.min[2]]));
  push(slab([x0, y0, hit.max[2]], [x1, y1, target.max[2]]));
  return out;
}

export function booleanBoxes(op: BooleanOp, target: Box, tool: Box): Box[] {
  if (op === 'subtract') return subtractBox(target, tool);
  if (op === 'intersect') {
    const hit = boxIntersect(target, tool);
    return hit ? [hit] : [];
  }
  return [target, tool];
}

const FACE_CORNERS: readonly (readonly [number, number, number, number])[] = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [1, 2, 6, 5],
  [0, 4, 7, 3],
];

export function bakeBoxes(boxes: readonly Box[]): {
  positions: number[];
  indices: number[];
  bbox: { min: [number, number, number]; max: [number, number, number] };
} {
  const positions: number[] = [];
  const indices: number[] = [];
  let min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  let max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  for (const box of boxes) {
    const base = positions.length / 3;
    for (let i = 0; i < 8; i += 1) {
      const x = i & 1 ? box.max[0] : box.min[0];
      const y = i & 2 ? box.max[1] : box.min[1];
      const z = i & 4 ? box.max[2] : box.min[2];
      positions.push(x, y, z);
    }
    for (const face of FACE_CORNERS) {
      indices.push(base + face[0], base + face[1], base + face[2]);
      indices.push(base + face[0], base + face[2], base + face[3]);
    }
    for (let k = 0; k < 3; k += 1) {
      const lo = box.min[k] ?? Number.POSITIVE_INFINITY;
      const hi = box.max[k] ?? Number.NEGATIVE_INFINITY;
      min[k] = Math.min(min[k] ?? Number.POSITIVE_INFINITY, lo);
      max[k] = Math.max(max[k] ?? Number.NEGATIVE_INFINITY, hi);
    }
  }

  if (!boxes.length) {
    min = [0, 0, 0];
    max = [0, 0, 0];
  }
  return { positions, indices, bbox: { min, max } };
}

export function boxesTris(boxes: readonly Box[]): number {
  return boxes.length * 12;
}
