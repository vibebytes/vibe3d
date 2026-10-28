import type { Env, StageState } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { backdropPlan, resolveExposure } from '../src/three/stage';

const env = (patch: Partial<Env> = {}): Env => ({
  background: [0.043, 0.055, 0.071, 1],
  ambient: [1, 1, 1, 1],
  ambientIntensity: 0.35,
  ...patch,
});

const stage: StageState = { preset: 'clean' };

describe('backdropPlan', () => {
  it('没有 gradient 时回落到纯色，与 backgroundHex 一致', () => {
    const plan = backdropPlan(env());
    expect(plan.kind).toBe('solid');
    expect(plan.kind === 'solid' && plan.hex).toBe('#0b0e12');
  });

  it('gradient: null 视作未设置', () => {
    expect(backdropPlan(env({ gradient: null })).kind).toBe('solid');
  });

  it('gradient 给出 2×256 RGBA 数据：首行是底部、末行是顶部', () => {
    const plan = backdropPlan(env({ gradient: { top: [1, 1, 1, 1], bottom: [0, 0, 0, 1] } }));
    expect(plan.kind).toBe('gradient');
    if (plan.kind !== 'gradient') throw new Error('unreachable');
    expect([plan.width, plan.height]).toEqual([2, 256]);
    expect(plan.data).toHaveLength(2 * 256 * 4);
    expect([...plan.data.slice(0, 8)]).toEqual([0, 0, 0, 255, 0, 0, 0, 255]);
    expect([...plan.data.slice(-8)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
    const mid = plan.data[128 * 2 * 4];
    expect(mid).toBeGreaterThan(120);
    expect(mid).toBeLessThan(136);
  });

  it('超出 0..1 的颜色被夹紧，不会写出非法字节', () => {
    const plan = backdropPlan(env({ gradient: { top: [1.5, -1, 0.5, 1], bottom: [0, 0, 0, 1] } }));
    if (plan.kind !== 'gradient') throw new Error('unreachable');
    expect([...plan.data.slice(-8).slice(0, 4)]).toEqual([255, 0, 128, 255]);
  });

  it('自动曝光按上下两端的均值亮度算，与同亮度的纯色一致', () => {
    const white = env({ gradient: { top: [1, 1, 1, 1], bottom: [1, 1, 1, 1] } });
    const solid = env({ background: [1, 1, 1, 1] });
    const auto: StageState = { preset: 'clean', autoExposure: true };
    expect(resolveExposure(auto, white)).toBeCloseTo(resolveExposure(auto, solid), 6);
  });
});
