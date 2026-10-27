import type { Geometry } from '@vibebyte/vibe3d-protocol';

export type Vec3 = [number, number, number];

export interface BakedMesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

function quad(out: BakedMesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3): void {
  const base = out.positions.length / 3;
  for (const p of [a, b, c, d]) {
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(n[0], n[1], n[2]);
  }
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function bakeBox(size: readonly [number, number, number]): BakedMesh {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  quad(out, [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz], [1, 0, 0]);
  quad(out, [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz], [-1, 0, 0]);
  quad(out, [-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [0, 1, 0]);
  quad(out, [-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [0, -1, 0]);
  quad(out, [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]);
  quad(out, [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]);
  return out;
}

function bakePlane(width: number, height: number): BakedMesh {
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  const hw = width / 2;
  const hh = height / 2;
  quad(out, [-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0], [0, 0, 1]);
  return out;
}

function bakeSphere(radius: number, segments: number): BakedMesh {
  const widthSegments = Math.max(3, segments);
  const heightSegments = Math.max(3, Math.round(segments / 2));
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  const gridWidth = widthSegments + 1;
  for (let iy = 0; iy <= heightSegments; iy += 1) {
    const v = iy / heightSegments;
    const phi = v * Math.PI;
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const u = ix / widthSegments;
      const theta = u * Math.PI * 2;
      const nx = -Math.cos(theta) * Math.sin(phi);
      const ny = Math.cos(phi);
      const nz = Math.sin(theta) * Math.sin(phi);
      out.positions.push(nx * radius, ny * radius, nz * radius);
      out.normals.push(nx, ny, nz);
    }
  }
  for (let iy = 0; iy < heightSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = ix + gridWidth * iy;
      const b = ix + gridWidth * (iy + 1);
      const c = ix + 1 + gridWidth * (iy + 1);
      const d = ix + 1 + gridWidth * iy;
      if (iy !== 0) out.indices.push(a, b, d);
      if (iy !== heightSegments - 1) out.indices.push(b, c, d);
    }
  }
  return out;
}

function bakeCylinder(radiusTop: number, radiusBottom: number, height: number, segments: number): BakedMesh {
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  const width = segments + 1;
  const hy = height / 2;
  const slope = (radiusBottom - radiusTop) / height;
  const ring = (radius: number, y: number) => {
    for (let ix = 0; ix <= segments; ix += 1) {
      const theta = (ix / segments) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      out.positions.push(sin * radius, y, cos * radius);
      const len = Math.hypot(sin, slope, cos);
      out.normals.push(sin / len, slope / len, cos / len);
    }
  };
  ring(radiusTop, hy);
  ring(radiusBottom, -hy);
  for (let ix = 0; ix < segments; ix += 1) {
    const a = ix;
    const b = ix + width;
    const c = ix + 1 + width;
    const d = ix + 1;
    out.indices.push(a, b, d, b, c, d);
  }
  const cap = (radius: number, y: number, up: boolean) => {
    const center = out.positions.length / 3;
    out.positions.push(0, y, 0);
    out.normals.push(0, up ? 1 : -1, 0);
    const start = out.positions.length / 3;
    for (let ix = 0; ix <= segments; ix += 1) {
      const theta = (ix / segments) * Math.PI * 2;
      out.positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius);
      out.normals.push(0, up ? 1 : -1, 0);
    }
    for (let ix = 0; ix < segments; ix += 1) {
      const a = start + ix;
      const b = start + ix + 1;
      if (up) out.indices.push(center, a, b);
      else out.indices.push(center, b, a);
    }
  };
  if (radiusTop > 0) cap(radiusTop, hy, true);
  if (radiusBottom > 0) cap(radiusBottom, -hy, false);
  return out;
}

function bakeTorus(majorRadius: number, tubeRadius: number, tubular: number, radial: number): BakedMesh {
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  const width = radial + 1;
  for (let iu = 0; iu <= tubular; iu += 1) {
    const theta = (iu / tubular) * Math.PI * 2;
    const sinU = Math.sin(theta);
    const cosU = Math.cos(theta);
    for (let iv = 0; iv <= radial; iv += 1) {
      const phi = (iv / radial) * Math.PI * 2;
      const cosV = Math.cos(phi);
      const sinV = Math.sin(phi);
      out.positions.push(
        (majorRadius + tubeRadius * cosV) * sinU,
        tubeRadius * sinV,
        (majorRadius + tubeRadius * cosV) * cosU,
      );
      out.normals.push(cosV * sinU, sinV, cosV * cosU);
    }
  }
  for (let iu = 0; iu < tubular; iu += 1) {
    for (let iv = 0; iv < radial; iv += 1) {
      const a = iu * width + iv;
      const b = (iu + 1) * width + iv;
      const c = (iu + 1) * width + iv + 1;
      const d = iu * width + iv + 1;
      out.indices.push(a, b, d, b, c, d);
    }
  }
  return out;
}

function bakeCapsule(radius: number, height: number, segments: number): BakedMesh {
  const out: BakedMesh = { positions: [], normals: [], indices: [] };
  const capSegments = Math.max(3, Math.round(segments / 2));
  const profile: Array<[number, number, number, number]> = [];
  for (let i = 0; i <= capSegments; i += 1) {
    const phi = (i / capSegments) * (Math.PI / 2);
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    profile.push([sin * radius, -height / 2 - cos * radius, sin, -cos]);
  }
  for (let i = 0; i <= capSegments; i += 1) {
    const phi = (i / capSegments) * (Math.PI / 2);
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    profile.push([sin * radius, height / 2 + cos * radius, sin, cos]);
  }
  const width = segments + 1;
  for (const [x, y, nx, ny] of profile) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const theta = (ix / segments) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      out.positions.push(x * sin, y, x * cos);
      out.normals.push(nx * sin, ny, nx * cos);
    }
  }
  for (let row = 0; row + 1 < profile.length; row += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = row * width + ix;
      const b = (row + 1) * width + ix;
      const c = (row + 1) * width + ix + 1;
      const d = row * width + ix + 1;
      out.indices.push(a, d, b, b, d, c);
    }
  }
  return out;
}

function faceNormals(positions: readonly number[], indices: readonly number[]): number[] {
  const normals = new Array<number>(positions.length).fill(0);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const ux = positions[ib]! - positions[ia]!;
    const uy = positions[ib + 1]! - positions[ia + 1]!;
    const uz = positions[ib + 2]! - positions[ia + 2]!;
    const vx = positions[ic]! - positions[ia]!;
    const vy = positions[ic + 1]! - positions[ia + 1]!;
    const vz = positions[ic + 2]! - positions[ia + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const idx of [ia, ib, ic]) {
      normals[idx] = normals[idx]! + nx;
      normals[idx + 1] = normals[idx + 1]! + ny;
      normals[idx + 2] = normals[idx + 2]! + nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (len < 1e-12) {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    } else {
      normals[i] = normals[i]! / len;
      normals[i + 1] = normals[i + 1]! / len;
      normals[i + 2] = normals[i + 2]! / len;
    }
  }
  return normals;
}

export function bakeGeometry(g: Geometry): BakedMesh {
  switch (g.type) {
    case 'box':
      return bakeBox(g.size);
    case 'plane':
      return bakePlane(g.width, g.height);
    case 'sphere':
      return bakeSphere(g.radius, g.segments);
    case 'cylinder':
      return bakeCylinder(g.radiusTop, g.radiusBottom, g.height, g.segments);
    case 'torus': {
      const radial = Math.max(3, Math.round(g.segments / 2));
      return bakeTorus(g.radius, g.tube, g.segments, radial);
    }
    case 'capsule':
      return bakeCapsule(g.radius, g.height, g.segments);
    case 'baked':
      return {
        positions: [...g.positions],
        normals:
          g.normals && g.normals.length === g.positions.length
            ? [...g.normals]
            : faceNormals(g.positions, g.indices),
        indices: [...g.indices],
      };
  }
}
