import { describe, expect, it } from 'vitest';
import { bakeBoxes, booleanBoxes, boxFromCenter, boxIntersect, subtractBox } from '../src/csg';

const volume = (boxes: { min: number[]; max: number[] }[]): number =>
  boxes.reduce(
    (sum, b) => sum + (b.max[0]! - b.min[0]!) * (b.max[1]! - b.min[1]!) * (b.max[2]! - b.min[2]!),
    0,
  );

const wall = boxFromCenter([0, 1.5, 0], [4, 3, 0.2]);
const door = boxFromCenter([0, 1, 0], [1, 2, 0.4]);

describe('csg：轴对齐 box 布尔', () => {
  it('subtract 开洞：体积 = 墙 - 洞，结果不覆盖洞心', () => {
    const boxes = booleanBoxes('subtract', wall, door);
    expect(boxes.length).toBe(3);
    expect(volume(boxes)).toBeCloseTo(4 * 3 * 0.2 - 1 * 2 * 0.2, 6);
    for (const b of boxes) {
      const covers = b.min[0]! < 0 && b.max[0]! > 0 && b.min[1]! < 1 && b.max[1]! > 1;
      expect(covers).toBe(false);
    }
  });

  it('洞比墙大时切成 6 块仍剩体积；完全覆盖时为空', () => {
    const big = booleanBoxes('subtract', wall, boxFromCenter([0, 1.5, 0], [10, 3, 10]));
    expect(big.length).toBe(0);
    const slit = subtractBox(wall, boxFromCenter([0, 1.5, 0], [1, 3, 0.2]));
    expect(slit.length).toBe(2);
    expect(volume(slit)).toBeCloseTo(4 * 3 * 0.2 - 1 * 3 * 0.2, 6);
  });

  it('union 合并 bbox，intersect 取交集；不相交时 subtract 原样返回', () => {
    const far = boxFromCenter([10, 0, 0], [1, 1, 1]);
    expect(boxIntersect(wall, far)).toBeNull();
    expect(subtractBox(wall, far)).toEqual([wall]);
    const union = booleanBoxes('union', wall, far);
    expect(union.length).toBe(2);
    const hit = booleanBoxes('intersect', wall, door);
    expect(hit.length).toBe(1);
    expect(volume(hit)).toBeCloseTo(1 * 2 * 0.2, 6);
  });

  it('bake 出 baked 几何：每块 8 顶点 36 索引，bbox 正确', () => {
    const baked = bakeBoxes(booleanBoxes('subtract', wall, door));
    expect(baked.positions.length).toBe(3 * 8 * 3);
    expect(baked.indices.length).toBe(3 * 36);
    expect(baked.bbox.min).toEqual([-2, 0, -0.1]);
    expect(baked.bbox.max[1]).toBeCloseTo(3, 6);
  });
});
