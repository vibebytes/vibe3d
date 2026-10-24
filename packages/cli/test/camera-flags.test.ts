import { cameraStateSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import type { ParsedArgs } from '../src/args';
import { cameraFromFlags, saveNameFrom } from '../src/camera-args';

const flags = (raw: Record<string, string | boolean>) => raw as ParsedArgs['flags'];

describe('CLI 机位参数', () => {
  it('名字与预设透传', () => {
    expect(cameraFromFlags(flags({ name: 'hero', preset: 'miniature_45' }))).toEqual({
      name: 'hero',
      preset: 'miniature_45',
    });
  });

  it('坐标与目标点解析成 camera 对象', () => {
    const out = cameraFromFlags(flags({ p: '1,2,3', target: '0,0,0', fov: '35' }));
    expect(cameraStateSchema.partial().parse(out.camera)).toEqual({
      p: [1, 2, 3],
      target: [0, 0, 0],
      fov: 35,
    });
  });

  it('空旗标返回空对象', () => {
    expect(cameraFromFlags(flags({}))).toEqual({});
  });

  it('非法预设与缺名字报错', () => {
    expect(() => cameraFromFlags(flags({ preset: 'drone' }))).toThrow(/预设/);
    expect(() => saveNameFrom(undefined)).toThrow(/名字/);
    expect(saveNameFrom('hero')).toBe('hero');
  });
});
