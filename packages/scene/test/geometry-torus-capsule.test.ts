import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { bakeGeometry, geometryTris, nodeBounds } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT } from './helpers';

const extentsOf = (b: { min: [number, number, number]; max: [number, number, number] }) =>
  [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const;

function docWithMesh(geometry: any) {
  const doc = emptyDoc('torus-capsule');
  doc.nodes.n_00000001 = {
    id: 'n_00000001',
    kind: 'mesh',
    name: '测试体',
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry,
    material: 'm_00000001',
  };
  doc.roots.push('n_00000001');
  doc.materials.m_00000001 = structuredClone(MAT);
  return doc;
}

function bakedExtents(baked: ReturnType<typeof bakeGeometry>) {
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
  for (let i = 0; i < baked.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, baked.positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, baked.positions[i + axis]!);
    }
  }
  return extentsOf({ min, max });
}

function expectClosedMesh(baked: ReturnType<typeof bakeGeometry>) {
  const v = baked.positions.length / 3;
  expect(v).toBe(baked.normals.length / 3);
  expect(baked.indices.length % 3).toBe(0);
  for (let i = 0; i < baked.indices.length; i += 1) {
    expect(baked.indices[i]).toBeGreaterThanOrEqual(0);
    expect(baked.indices[i]).toBeLessThan(v);
  }
  for (let i = 0; i < baked.normals.length; i += 3) {
    const len = Math.hypot(baked.normals[i]!, baked.normals[i + 1]!, baked.normals[i + 2]!);
    expect(len).toBeGreaterThan(0.9);
    expect(len).toBeLessThan(1.1);
  }
}

describe('bakeGeometry: torus', () => {
  it('bbox = 2*(R+r) × 2r × 2*(R+r)，法线单位化且索引闭合', () => {
    const baked = bakeGeometry({ type: 'torus', radius: 1, tube: 0.25, segments: 32 });
    const [ex, ey, ez] = bakedExtents(baked);
    expect(ex).toBeCloseTo(2.5, 6);
    expect(ey).toBeCloseTo(0.5, 6);
    expect(ez).toBeCloseTo(2.5, 6);
    expectClosedMesh(baked);
  });

  it('顶点位于环面解析式上：|(sqrt(x²+z²)-R)² + y² - r²| ≈ 0', () => {
    const R = 1.2;
    const r = 0.4;
    const baked = bakeGeometry({ type: 'torus', radius: R, tube: r, segments: 16 });
    for (let i = 0; i < baked.positions.length; i += 3) {
      const [x, y, z] = [baked.positions[i]!, baked.positions[i + 1]!, baked.positions[i + 2]!];
      const radial = Math.hypot(x, z);
      expect(Math.abs((radial - R) ** 2 + y * y - r * r)).toBeLessThan(1e-6);
    }
  });
});

describe('bakeGeometry: capsule', () => {
  it('bbox = 2r × (height+2r) × 2r，索引闭合', () => {
    const r = 0.5;
    const height = 1.5;
    const baked = bakeGeometry({ type: 'capsule', radius: r, height, segments: 24 });
    const [ex, ey, ez] = bakedExtents(baked);
    expect(ex).toBeCloseTo(2 * r, 6);
    expect(ey).toBeCloseTo(height + 2 * r, 6);
    expect(ez).toBeCloseTo(2 * r, 6);
    expectClosedMesh(baked);
  });

  it('半球顶点位于球面解析式上', () => {
    const r = 0.5;
    const height = 1;
    const baked = bakeGeometry({ type: 'capsule', radius: r, height, segments: 16 });
    for (let i = 0; i < baked.positions.length; i += 3) {
      const [x, y, z] = [baked.positions[i]!, baked.positions[i + 1]!, baked.positions[i + 2]!];
      if (Math.abs(y) < height / 2 - 1e-9) continue;
      const cy = y > 0 ? height / 2 : -height / 2;
      expect(Math.abs(x * x + (y - cy) ** 2 + z * z - r * r)).toBeLessThan(1e-6);
    }
  });
});

describe('geometryTris', () => {
  it('torus = 环向 × 管向 × 2', () => {
    const segments = 32;
    const radial = Math.max(3, Math.round(segments / 2));
    expect(geometryTris({ type: 'torus', radius: 1, tube: 0.25, segments })).toBe(segments * radial * 2);
  });

  it('capsule = (2*capSeg+1) × segments × 2', () => {
    const segments = 24;
    const capSeg = Math.max(3, Math.round(segments / 2));
    expect(geometryTris({ type: 'capsule', radius: 0.5, height: 1.5, segments })).toBe(
      (2 * capSeg + 1) * segments * 2,
    );
  });
});

describe('nodeBounds（bbox 取景）', () => {
  it('torus 外接盒 = 2*(R+r) × 2r × 2*(R+r)', () => {
    const bounds = nodeBounds(
      docWithMesh({ type: 'torus', radius: 1, tube: 0.25, segments: 32 }),
      'n_00000001',
    );
    expect(bounds).not.toBeNull();
    const [ex, ey, ez] = extentsOf(bounds!);
    expect(ex).toBeCloseTo(2.5, 6);
    expect(ey).toBeCloseTo(0.5, 6);
    expect(ez).toBeCloseTo(2.5, 6);
  });

  it('capsule 外接盒 = 2r × (height+2r) × 2r', () => {
    const bounds = nodeBounds(
      docWithMesh({ type: 'capsule', radius: 0.5, height: 1.5, segments: 24 }),
      'n_00000001',
    );
    expect(bounds).not.toBeNull();
    const [ex, ey, ez] = extentsOf(bounds!);
    expect(ex).toBeCloseTo(1, 6);
    expect(ey).toBeCloseTo(2.5, 6);
    expect(ez).toBeCloseTo(1, 6);
  });
});
