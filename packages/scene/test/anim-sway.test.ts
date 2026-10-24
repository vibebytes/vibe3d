import { describe, expect, it } from 'vitest';
import { applyClipTransform, sampleClip } from '../src/anim';

const clip = (o: Record<string, unknown>): any => o;
const base = { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] } as any;

const sway = (o: Record<string, unknown> = {}) =>
  clip({ type: 'sway', amplitude: 0.2, frequency: 0.4, ...o });

const peak = (c: any, from: number, to: number): number => {
  let max = 0;
  for (let t = from; t <= to; t += 0.01) max = Math.max(max, Math.abs(sampleClip(c, t)));
  return max;
};

describe('sway 参数化：axis / gust', () => {
  it('axis 覆盖默认旋转轴：axis=x 只改 rx', () => {
    const out = applyClipTransform(base, sway({ axis: 'x' }), 0.3);
    expect(out.r[0]).not.toBeCloseTo(0, 6);
    expect(out.r[1]).toBeCloseTo(0, 9);
    expect(out.r[2]).toBeCloseTo(0, 9);
  });

  it('axis 优先于显式 channel：channel=px + axis=y 只改 ry', () => {
    const out = applyClipTransform(base, sway({ channel: 'px', axis: 'y' }), 0.3);
    expect(out.p).toEqual(base.p);
    expect(out.r[0]).toBeCloseTo(0, 9);
    expect(out.r[1]).not.toBeCloseTo(0, 6);
    expect(out.r[2]).toBeCloseTo(0, 9);
  });

  it('axis 缺省时沿用 sway 的 rz', () => {
    const out = applyClipTransform(base, sway(), 0.3);
    expect(out.r[0]).toBeCloseTo(0, 9);
    expect(out.r[1]).toBeCloseTo(0, 9);
    expect(out.r[2]).not.toBeCloseTo(0, 6);
  });

  it('gust 缺省与 gust=0 逐点一致', () => {
    const plain = sway();
    const zero = sway({ gust: 0 });
    for (let i = 0; i <= 20; i += 1) {
      expect(sampleClip(zero, i / 3)).toBeCloseTo(sampleClip(plain, i / 3), 12);
    }
  });

  it('gust 抬高峰值但不超过 (1+gust) 倍 amplitude，起手位形不动', () => {
    const plain = peak(sway(), 0, 60);
    const half = peak(sway({ gust: 0.5 }), 0, 60);
    const full = peak(sway({ gust: 1 }), 0, 60);
    expect(plain).toBeCloseTo(0.2, 2);
    expect(half).toBeGreaterThan(plain);
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(half).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(sampleClip(sway({ gust: 1 }), 0)).toBeCloseTo(0, 12);
  });

  it('gust 只作用于 sway，float 上的 gust 被忽略', () => {
    const a = clip({ type: 'float', channel: 'py', amplitude: 0.3, frequency: 0.5 });
    const b = clip({ type: 'float', channel: 'py', amplitude: 0.3, frequency: 0.5, gust: 1 });
    for (let i = 0; i <= 20; i += 1) {
      expect(sampleClip(b, i / 7)).toBeCloseTo(sampleClip(a, i / 7), 12);
    }
  });
});
