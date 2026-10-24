import { describe, expect, it } from 'vitest';
import { patchNpr, patchPost } from '../src/inspector/stage-patch';

describe('面板块的 stage 补丁', () => {
  it('关掉全部 NPR 项时把 npr 置空，避免留下空对象', () => {
    expect(patchNpr(undefined, { outline: null })).toBeNull();
    expect(patchNpr({ rampSteps: 3 }, { rampSteps: null })).toBeNull();
  });

  it('NPR 补丁保留未提到的字段', () => {
    expect(patchNpr({ rampSteps: 3, rim: 0.4 }, { outline: { width: 2 } })).toEqual({
      rampSteps: 3,
      rim: 0.4,
      outline: { width: 2 },
    });
  });

  it('只改描边宽度时不丢颜色', () => {
    const current = { outline: { width: 1.5, color: [1, 0, 0, 1] as const } };
    expect(patchNpr(current, { outline: { width: 3 } })).toEqual({
      outline: { width: 3 },
    });
  });

  it('后处理补丁逐项合并，删空后返回 null', () => {
    expect(patchPost({ bloom: {} }, { dof: { aperture: 0.03 } })).toEqual({
      bloom: {},
      dof: { aperture: 0.03 },
    });
    expect(patchPost({ bloom: {}, tonemap: 'aces' }, { bloom: null, tonemap: null })).toBeNull();
  });
});
