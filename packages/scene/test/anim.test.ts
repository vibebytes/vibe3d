import { describe, expect, it } from 'vitest';
import { applyClipTransform, sampleClip } from '../src/anim';

const clip = (o: Record<string, unknown>): any => o;
const base = { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] } as any;

describe('程序化动画 clip 求值', () => {
  it('keyframes 线性插值：t=0.5 精确命中中值', () => {
    const c = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 10 },
      ],
    });
    expect(sampleClip(c, 0)).toBeCloseTo(0, 9);
    expect(sampleClip(c, 0.5)).toBeCloseTo(5, 9);
    expect(sampleClip(c, 1)).toBeCloseTo(10, 9);
    expect(sampleClip(c, 2)).toBeCloseTo(10, 9);
  });

  it('easeIn 单调、端点精确，中点慢于线性', () => {
    const c = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0, ease: 'easeIn' },
        { t: 1, v: 10 },
      ],
    });
    expect(sampleClip(c, 0)).toBeCloseTo(0, 9);
    expect(sampleClip(c, 1)).toBeCloseTo(10, 9);
    let prev = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 10; i += 1) {
      const v = sampleClip(c, i / 10);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(sampleClip(c, 0.5)).toBeLessThan(5);
  });

  it('loop 按 duration 取模，speed 缩放时间轴', () => {
    const c = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 4 },
      ],
      loop: true,
      duration: 1,
      speed: 2,
    });
    expect(sampleClip(c, 0.25)).toBeCloseTo(2, 9);
    expect(sampleClip(c, 0.5)).toBeCloseTo(0, 9);
    expect(sampleClip(c, 0.75)).toBeCloseTo(2, 9);
  });

  it('sway 在 t=0 为 0，四分之一周期达到 amplitude', () => {
    const c = clip({ type: 'sway', amplitude: 0.4, frequency: 0.5 });
    expect(sampleClip(c, 0)).toBeCloseTo(0, 9);
    expect(sampleClip(c, 0.5)).toBeCloseTo(0.4, 9);
    expect(sampleClip(c, 1)).toBeCloseTo(0, 9);
  });

  it('float / ripple / flicker 幅度与频率生效', () => {
    const f = clip({ type: 'float', amplitude: 0.2, frequency: 0.25 });
    expect(sampleClip(f, 1)).toBeCloseTo(0.2, 9);
    const r = clip({ type: 'ripple', amplitude: 0.1, frequency: 0.5 });
    expect(Math.abs(sampleClip(r, 0.5))).toBeCloseTo(0.1, 9);
    const k = clip({ type: 'flicker', amplitude: 0.6, frequency: 2 });
    expect(sampleClip(k, 0)).toBeGreaterThanOrEqual(0);
    expect(sampleClip(k, 0.125)).toBeCloseTo(0.6, 9);
  });

  it('spin 按圈数累积角度', () => {
    const c = clip({ type: 'spin', speed: 0.25 });
    expect(sampleClip(c, 0)).toBeCloseTo(0, 9);
    expect(sampleClip(c, 1)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('applyClipTransform：位移相加、旋转相加、缩放相乘，且不改基准', () => {
    const move = clip({
      type: 'keyframes',
      channel: 'py',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 2 },
      ],
    });
    const out = applyClipTransform(base, move, 0.5);
    expect(out.p).toEqual([1, 3, 3]);
    expect(out.r).toEqual([0, 0, 0]);
    expect(out.s).toEqual([1, 1, 1]);
    expect(base).toEqual({ p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] });

    const grow = clip({
      type: 'keyframes',
      channel: 'sy',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: 0.5 },
      ],
    });
    expect(applyClipTransform(base, grow, 1).s).toEqual([1, 1.5, 1]);
  });

  it('缺省通道按类型推断', () => {
    const sway = clip({ type: 'sway', amplitude: 1 });
    expect(applyClipTransform(base, sway, 0.5 * 1).r[2]).toBeCloseTo(1, 9);
    const spin = clip({ type: 'spin', speed: 1 });
    expect(applyClipTransform(base, spin, 0.25).r[1]).toBeCloseTo(Math.PI / 2, 9);
  });
});
