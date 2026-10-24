import { describe, expect, it } from 'vitest';
import { parseSnapshotCamera } from '../src/stores/snapshot-camera';

describe('snapshot 相机解析', () => {
  it('解析完整相机并保留三元组精度', () => {
    const cam = parseSnapshotCamera({
      p: [1, 2, 3],
      target: [-1, 0.5, 2],
      fov: 42,
    });
    expect(cam).toEqual({ mode: 'persp', p: [1, 2, 3], target: [-1, 0.5, 2], fov: 42, zoom: 1 });
  });

  it('缺少 p / target 或长度不为 3 时返回 undefined', () => {
    expect(parseSnapshotCamera({ target: [0, 0, 0], fov: 45 })).toBeUndefined();
    expect(parseSnapshotCamera({ p: [0, 0], target: [0, 0, 0], fov: 45 })).toBeUndefined();
    expect(parseSnapshotCamera({ p: [0, 0, 0], fov: 45 })).toBeUndefined();
  });

  it('非有限数值一律视为无效', () => {
    expect(parseSnapshotCamera({ p: [0, 0, Number.NaN], target: [0, 0, 0], fov: 45 })).toBeUndefined();
    expect(
      parseSnapshotCamera({ p: [0, 0, 0], target: [0, 0, 0], fov: Number.POSITIVE_INFINITY }),
    ).toBeUndefined();
  });

  it('fov 越界时收敛到 1..179', () => {
    expect(parseSnapshotCamera({ p: [0, 0, 3], target: [0, 0, 0], fov: 500 })?.fov).toBe(179);
    expect(parseSnapshotCamera({ p: [0, 0, 3], target: [0, 0, 0], fov: 0 })?.fov).toBe(1);
  });

  it('非对象输入返回 undefined', () => {
    expect(parseSnapshotCamera(undefined)).toBeUndefined();
    expect(parseSnapshotCamera('camera')).toBeUndefined();
    expect(parseSnapshotCamera(null)).toBeUndefined();
  });
});
