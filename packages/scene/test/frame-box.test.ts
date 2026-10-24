import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { type Bounds, frameTarget } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT } from './helpers';

function docWithCube(): ReturnType<typeof emptyDoc> {
  const doc = emptyDoc('frame');
  doc.nodes.n_00000001 = {
    id: 'n_00000001',
    kind: 'mesh',
    name: '立方体',
    parent: null,
    visible: true,
    transform: { p: [0, 0.5, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [1, 1, 1] },
    material: 'm_00000001',
  };
  doc.roots.push('n_00000001');
  doc.materials.m_00000001 = structuredClone(MAT);
  return doc;
}

const BOX: Bounds = { min: [2, 1, -1], max: [6, 3, 3] };
const diagOf = (b: Bounds) => Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
const distance = (c: { p: readonly number[]; target: readonly number[] }) =>
  Math.hypot(c.p[0]! - c.target[0]!, c.p[1]! - c.target[1]!, c.p[2]! - c.target[2]!);

describe('frameTarget bbox', () => {
  it('bbox 取景：相机正对区域，diag 等于 bbox 对角', () => {
    const result = frameTarget(docWithCube(), { bbox: BOX });
    expect(result).not.toBeNull();
    expect(result?.source).toBe('bbox');
    expect(result?.bounds).toEqual(BOX);
    expect(result?.diag).toBeCloseTo(diagOf(BOX), 6);
    expect(result?.camera.target).toEqual([4, 2, 1]);
  });

  it('padding 放大取景距离，bounds 不变', () => {
    const plain = frameTarget(docWithCube(), { bbox: BOX })!;
    const padded = frameTarget(docWithCube(), { bbox: BOX, padding: 2 })!;
    expect(padded.bounds).toEqual(plain.bounds);
    expect(distance(padded.camera)).toBeCloseTo(distance(plain.camera) * 2, 4);
  });

  it('退化 bbox 回退全场景且不抛错', () => {
    const result = frameTarget(docWithCube(), { bbox: { min: [1, 1, 1], max: [1, 1, 1] } });
    expect(result?.source).toBe('scene');
    expect(result?.bounds.min).toEqual([-0.5, 0, -0.5]);
    expect(result?.bounds.max).toEqual([0.5, 1, 0.5]);
  });

  it('view 与输出 camera 回显：front 视线沿 +Z', () => {
    const result = frameTarget(docWithCube(), { bbox: BOX, view: 'front' })!;
    const offset = [
      result.camera.p[0] - result.camera.target[0],
      result.camera.p[1] - result.camera.target[1],
      result.camera.p[2] - result.camera.target[2],
    ];
    expect(Math.abs(offset[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(offset[1]!)).toBeLessThan(1e-6);
    expect(offset[2]!).toBeGreaterThan(0);
    expect(result.view).toBe('front');
  });
});
