import { AppError } from '@vibebyte/vibe3d-protocol';

export type Vec3 = [number, number, number];

export interface BackdropSpec {
  width?: number;
  depth?: number;
  height?: number;
  curve?: number;
  segments?: number;
}

export interface BackdropMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  bbox: { min: Vec3; max: Vec3 };
}

export const BACKDROP_DEFAULTS = {
  width: 10,
  depth: 4,
  height: 6,
  curve: 1.2,
  segments: 16,
} as const;

const MIN_SEGMENTS = 4;
const MAX_SEGMENTS = 64;

export function backdropSweep(spec: BackdropSpec = {}): BackdropMesh {
  const width = spec.width ?? BACKDROP_DEFAULTS.width;
  const depth = spec.depth ?? BACKDROP_DEFAULTS.depth;
  const height = spec.height ?? BACKDROP_DEFAULTS.height;
  const curve = spec.curve ?? BACKDROP_DEFAULTS.curve;
  const segments = Math.min(
    MAX_SEGMENTS,
    Math.max(MIN_SEGMENTS, Math.round(spec.segments ?? BACKDROP_DEFAULTS.segments)),
  );
  if (!(width > 0)) throw new AppError('E_INVALID_PARAMS', 'backdrop 的 width 必须大于 0');
  if (!(depth > 0)) throw new AppError('E_INVALID_PARAMS', 'backdrop 的 depth 必须大于 0');
  if (!(curve > 0)) throw new AppError('E_INVALID_PARAMS', 'backdrop 的 curve 必须大于 0');
  if (!(height > curve)) throw new AppError('E_INVALID_PARAMS', 'backdrop 的 height 必须大于 curve');
  if (!(depth > curve)) throw new AppError('E_INVALID_PARAMS', 'backdrop 的 depth 必须大于 curve');

  const py = [0];
  const pz = [0];
  const ny = [1];
  const nz = [0];
  for (let k = 1; k <= segments; k += 1) {
    const th = (k * Math.PI) / 2 / segments;
    py.push(curve - curve * Math.cos(th));
    pz.push(-(depth - curve) - curve * Math.sin(th));
    ny.push(Math.cos(th));
    nz.push(Math.sin(th));
  }
  py.push(height);
  pz.push(-depth);
  ny.push(0);
  nz.push(1);

  const profile = py.length;
  const half = width / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let k = 0; k < profile; k += 1) {
    for (const x of [-half, half]) {
      positions.push(x, py[k]!, pz[k]!);
      normals.push(0, ny[k]!, nz[k]!);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < profile - 1; k += 1) {
    const b = k * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }

  return {
    positions,
    normals,
    indices,
    bbox: { min: [-half, 0, -depth], max: [half, height, 0] },
  };
}
