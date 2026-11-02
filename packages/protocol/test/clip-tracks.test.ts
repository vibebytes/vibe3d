import { describe, expect, it } from 'vitest';
import { clipSchema } from '../src/scene';

describe('clip.type 与 tracks 的必填关系', () => {
  it('只有 tracks 时可以不写 type', () => {
    const parsed = clipSchema.parse({ tracks: [{ path: 'rotation', keys: [{ t: 0, v: [0, 0, 0] }] }] });
    expect(parsed.type).toBeUndefined();
  });

  it('既没有 type 也没有 tracks 时报错并说明原因', () => {
    const parsed = clipSchema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('需要 type 或 tracks');
  });
});

describe('clip.tracks 通用属性轨道', () => {
  it('接受 position 轨道的 3 元数组关键帧', () => {
    const parsed = clipSchema.parse({
      type: 'keyframes',
      tracks: [
        {
          path: 'position',
          interp: 'linear',
          keys: [
            { t: 0, v: [0, 0, 0] },
            { t: 2, v: [4, 0, 0] },
          ],
        },
      ],
    });
    expect(parsed.tracks?.[0]?.path).toBe('position');
  });

  it('rotation / scale 轨道同样接受 3 元数组', () => {
    for (const path of ['rotation', 'scale'] as const) {
      const parsed = clipSchema.parse({
        type: 'keyframes',
        tracks: [{ path, keys: [{ t: 0, v: [0, 0, 0] }] }],
      });
      expect(parsed.tracks?.[0]?.path).toBe(path);
    }
  });

  it('visible 轨道接受布尔值，opacity 轨道接受数字', () => {
    const parsed = clipSchema.parse({
      type: 'keyframes',
      tracks: [
        {
          path: 'visible',
          keys: [
            { t: 0, v: true },
            { t: 1, v: false },
          ],
        },
        {
          path: 'opacity',
          keys: [
            { t: 0, v: 1 },
            { t: 1, v: 0.2 },
          ],
        },
      ],
    });
    expect(parsed.tracks).toHaveLength(2);
  });

  it('position 轨道给 2 元数组时报错', () => {
    expect(() =>
      clipSchema.parse({
        type: 'keyframes',
        tracks: [{ path: 'position', keys: [{ t: 0, v: [0, 0] }] }],
      }),
    ).toThrow();
  });

  it('visible 轨道给数字时报错', () => {
    expect(() =>
      clipSchema.parse({
        type: 'keyframes',
        tracks: [{ path: 'visible', keys: [{ t: 0, v: 1 }] }],
      }),
    ).toThrow();
  });

  it('interp 支持 linear / step / ease / cubic，未知值报错', () => {
    for (const interp of ['linear', 'step', 'ease', 'cubic'] as const) {
      expect(() =>
        clipSchema.parse({
          type: 'keyframes',
          tracks: [{ path: 'position', interp, keys: [{ t: 0, v: [0, 0, 0] }] }],
        }),
      ).not.toThrow();
    }
    expect(() =>
      clipSchema.parse({
        type: 'keyframes',
        tracks: [{ path: 'position', interp: 'bogus', keys: [{ t: 0, v: [0, 0, 0] }] }],
      }),
    ).toThrow();
  });

  it('未知 path 报错', () => {
    expect(() =>
      clipSchema.parse({
        type: 'keyframes',
        tracks: [{ path: 'color', keys: [{ t: 0, v: [0, 0, 0] }] }],
      }),
    ).toThrow();
  });

  it('tracks 为空数组报错', () => {
    expect(() => clipSchema.parse({ type: 'keyframes', tracks: [] })).toThrow();
  });
});

describe('clip 未知字段不再静默忽略', () => {
  it('clip.property 报错', () => {
    expect(() => clipSchema.parse({ type: 'sway', property: 'position' })).toThrow();
  });

  it('clip 内未知字段报错', () => {
    expect(() => clipSchema.parse({ type: 'sway', bogus: 1 })).toThrow();
  });

  it('合法字段仍然通过', () => {
    expect(() => clipSchema.parse({ type: 'sway', axis: 'x', amplitude: 0.2 })).not.toThrow();
  });
});

describe('constant track shorthand', () => {
  it('{path, value} becomes one step key', () => {
    const parsed = clipSchema.parse({ tracks: [{ path: 'rotation', value: [-1.4, 0, 0] }] });
    expect(parsed.tracks?.[0]).toEqual({
      path: 'rotation',
      interp: 'step',
      keys: [{ t: 0, v: [-1.4, 0, 0] }],
    });
  });

  it('value together with keys is rejected', () => {
    const r = clipSchema.safeParse({
      tracks: [{ path: 'rotation', value: [0, 0, 0], keys: [{ t: 0, v: [0, 0, 0] }] }],
    });
    expect(r.success).toBe(false);
  });
});
