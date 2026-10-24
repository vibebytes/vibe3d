import { AppError, type Transform } from '@vibebyte/vibe3d-protocol';

export type Vec3 = [number, number, number];
export type ArrayMode = 'linear' | 'radial' | 'grid';
export type ArrayAxis = 'x' | 'y' | 'z';

export interface ArrayOptions {
  mode?: ArrayMode;
  count: number;
  offset?: Vec3;
  jitter?: Vec3;
  rotateStep?: Vec3;
  cols?: number;
  radius?: number;
  sweep?: number;
  axis?: ArrayAxis;
  center?: Vec3;
}

export interface Placement {
  translate: Vec3;
  rotate: Vec3;
}

const RAD = Math.PI / 180;

function bad(message: string, data?: Record<string, unknown>): never {
  throw new AppError('E_INVALID_PARAMS', message, data);
}

function radialUnit(axis: ArrayAxis, radius: number): Vec3 {
  if (axis === 'x') return [0, radius, 0];
  return [radius, 0, 0];
}

function spin(axis: ArrayAxis, v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  if (axis === 'x') return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  if (axis === 'z') return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotateDelta(axis: ArrayAxis, deg: number): Vec3 {
  if (axis === 'x') return [deg, 0, 0];
  if (axis === 'z') return [0, 0, deg];
  return [0, deg, 0];
}

function jitterAt(j: Vec3 | undefined, i: number): Vec3 {
  if (!j) return [0, 0, 0];
  return [j[0] * Math.sin(i), j[1] * Math.sin(i * 1.7), j[2] * Math.cos(i * 1.3)];
}

export function arrayPlacements(base: Transform, opts: ArrayOptions): Placement[] {
  const mode = opts.mode ?? 'linear';
  const count = Math.floor(opts.count);
  if (!Number.isFinite(count) || count < 0) bad(`count 必须为非负整数：${opts.count}`, { count: opts.count });
  if (count === 0) return [];
  const out: Placement[] = [];

  if (mode === 'linear' || mode === 'grid') {
    const offset = opts.offset;
    if (!offset) bad(`${mode} 阵列必须提供 offset`, { mode });
    if (mode === 'grid') {
      const cols = opts.cols ?? count;
      if (!Number.isFinite(cols) || cols < 1) bad(`grid 阵列的 cols 必须 ≥ 1：${cols}`, { cols });
      for (let i = 1; i <= count; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const j = jitterAt(opts.jitter, i);
        out.push({
          translate: [col * offset[0] + j[0], row * offset[1] + j[1], row * offset[2] + j[2]],
          rotate: opts.rotateStep ? [opts.rotateStep[0] * i, opts.rotateStep[1] * i, opts.rotateStep[2] * i] : [0, 0, 0],
        });
      }
      return out;
    }
    for (let i = 1; i <= count; i += 1) {
      const j = jitterAt(opts.jitter, i);
      out.push({
        translate: [offset[0] * i + j[0], offset[1] * i + j[1], offset[2] * i + j[2]],
        rotate: opts.rotateStep ? [opts.rotateStep[0] * i, opts.rotateStep[1] * i, opts.rotateStep[2] * i] : [0, 0, 0],
      });
    }
    return out;
  }

  const axis = opts.axis ?? 'y';
  const sweep = opts.sweep ?? 360;
  if (!Number.isFinite(sweep) || sweep === 0) bad(`radial 阵列的 sweep 不能为 0`, { sweep });
  const center = opts.center;
  let radial: Vec3;
  if (center) {
    radial = [base.p[0] - center[0], base.p[1] - center[1], base.p[2] - center[2]];
    const dist = Math.hypot(radial[0], radial[1], radial[2]);
    if (dist < 1e-9) bad('radial 阵列的 center 与源节点重合，无法确定半径', { center });
    if (opts.radius !== undefined && Math.abs(dist - opts.radius) > 1e-6) {
      bad(`radial 阵列的 center 与 radius 不一致：|base-center|=${dist}，radius=${opts.radius}`, {
        center,
        radius: opts.radius,
        distance: dist,
      });
    }
  } else {
    const radius = opts.radius;
    if (radius === undefined) bad('radial 阵列必须提供 radius 或 center', {});
    if (!Number.isFinite(radius) || radius <= 0) bad(`radial 阵列的 radius 必须 > 0：${radius}`, { radius });
    radial = radialUnit(axis, radius);
  }
  const origin: Vec3 = center ?? [...base.p];
  const step = sweep / (count + 1);

  for (let i = 1; i <= count; i += 1) {
    const deg = step * i;
    const v = spin(axis, radial, deg);
    const j = jitterAt(opts.jitter, i);
    out.push({
      translate: [origin[0] + v[0] - base.p[0] + j[0], origin[1] + v[1] - base.p[1] + j[1], origin[2] + v[2] - base.p[2] + j[2]],
      rotate: rotateDelta(axis, deg),
    });
  }
  return out;
}
