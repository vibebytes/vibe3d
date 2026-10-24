import { fxSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import type { ParsedArgs } from '../src/args';
import { clipFromFlags, fogFromFlags, fxSpecFromFlags } from '../src/fx-args';

const flags = (raw: Record<string, string | boolean>) => raw as ParsedArgs['flags'];

const parseFx = (raw: Record<string, string | boolean>) => fxSchema.omit({ id: true }).parse(fxSpecFromFlags(flags(raw)));

describe('CLI 特效参数', () => {
  it('默认粒子，颜色支持 #rrggbb 与 #rrggbbaa', () => {
    const spec = parseFx({ color: '#ff8800' });
    expect(spec.type).toBe('particles');
    expect(spec.color).toEqual([1, 0.5333333333333333, 0, 1]);
    expect(parseFx({ type: 'shaft', color: '#3366ffcc' }).color).toEqual([
      0.2, 0.4, 1, 0.8,
    ]);
  });

  it('数值与向量旗标原样透传', () => {
    const spec = parseFx({
      type: 'shaft',
      node: 'n_00000001',
      position: '0,1,2',
      spread: '0.5,0,0.5',
      rate: '30',
      life: '1.5',
      size: '0.2',
      speed: '2',
      intensity: '3',
      'radius-top': '0.1',
      'radius-bottom': '0.4',
      length: '6',
    });
    expect(spec).toMatchObject({
      type: 'shaft',
      nodeId: 'n_00000001',
      position: [0, 1, 2],
      spread: [0.5, 0, 0.5],
      rate: 30,
      life: 1.5,
      size: 0.2,
      speed: 2,
      intensity: 3,
      radiusTop: 0.1,
      radiusBottom: 0.4,
      length: 6,
    });
  });

  it('未知类型报错', () => {
    expect(() => fxSpecFromFlags(flags({ type: 'smoke' }))).toThrow(/未知特效类型 smoke/);
  });
});

describe('CLI 程序化动画参数', () => {
  it('最小参数只给类型', () => {
    expect(clipFromFlags(flags({ type: 'sway' }))).toEqual({ type: 'sway' });
  });

  it('轨道细节透传', () => {
    expect(clipFromFlags(flags({ type: 'ripple', channel: 'pz', amplitude: '0.4', frequency: '0.2', phase: '1.5', speed: '0.5', duration: '4' }))).toEqual({
      type: 'ripple',
      channel: 'pz',
      amplitude: 0.4,
      frequency: 0.2,
      phase: 1.5,
      speed: 0.5,
      duration: 4,
    });
  });

  it('缺少或未知类型报错', () => {
    expect(() => clipFromFlags(flags({}))).toThrow(/anim define 需要 --type/);
    expect(() => clipFromFlags(flags({ type: 'wobble' }))).toThrow(/未知动画类型 wobble/);
  });
});

describe('CLI 雾参数', () => {
  it('--fog near,far 生成雾', () => {
    expect(fogFromFlags(flags({ fog: '4,30' }))).toEqual({ fog: { near: 4, far: 30 } });
  });

  it('--fog-color 覆盖颜色', () => {
    expect(fogFromFlags(flags({ fog: '1,8', 'fog-color': '#ffffff' }))).toEqual({
      fog: { near: 1, far: 8, color: [1, 1, 1, 1] },
    });
  });

  it('--no-fog 清除雾', () => {
    expect(fogFromFlags(flags({ fog: false }))).toEqual({ fog: null });
  });

  it('未给雾旗标返回 undefined', () => {
    expect(fogFromFlags(flags({}))).toBeUndefined();
  });
});
