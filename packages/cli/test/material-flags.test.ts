import { mapTransformSchema, materialSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import type { ParsedArgs } from '../src/args';
import { mapFromFlags, materialPatchFromFlags } from '../src/material-args';

const flags = (raw: Record<string, string | boolean>) => raw as ParsedArgs['flags'];

const parsePatch = (raw: Record<string, string | boolean>) =>
  materialSchema.partial().parse(materialPatchFromFlags(flags(raw)));

describe('CLI 材质参数', () => {
  it('标量旗标直接映射到 patch', () => {
    expect(
      parsePatch({
        roughness: '0.3',
        metalness: '0.8',
        opacity: '0.55',
        'emissive-intensity': '2',
        'double-sided': 'true',
      }),
    ).toEqual({
      roughness: 0.3,
      metalness: 0.8,
      opacity: 0.55,
      emissiveIntensity: 2,
      doubleSided: true,
    });
  });

  it('baseColor 支持 #rrggbb 与 #rrggbbaa，emissive 只取 rgb', () => {
    expect(parsePatch({ 'base-color': '#ff8800' }).baseColor).toEqual([1, 0.5333333333333333, 0, 1]);
    expect(parsePatch({ 'base-color': '#3366ffcc' }).baseColor).toEqual([0.2, 0.4, 1, 0.8]);
    expect(parsePatch({ emissive: '#00ff00' }).emissive).toEqual([0, 1, 0]);
  });

  it('--patch JSON 与显式旗标合并，旗标优先', () => {
    expect(parsePatch({ patch: '{"roughness":0.9,"metalness":0.1}', roughness: '0.2' })).toEqual({
      roughness: 0.2,
      metalness: 0.1,
    });
  });

  it('非法颜色与缺失字段报错', () => {
    expect(() => parsePatch({ 'base-color': 'red' })).toThrow(/颜色需要/);
    expect(() => materialPatchFromFlags(flags({}))).toThrow(/至少给一个材质字段/);
  });
});

describe('CLI 贴图参数', () => {
  it('平铺、偏移与旋转透传', () => {
    const map = mapTransformSchema
      .partial()
      .parse(mapFromFlags(flags({ sha: 'a'.repeat(64), tiling: '2,3', offset: '0.1,-0.2', rotation: '90' })));
    expect(map).toEqual({
      sha: 'a'.repeat(64),
      tiling: [2, 3],
      offset: [0.1, -0.2],
      rotation: 90,
    });
  });

  it('平铺必须为正数二元组', () => {
    expect(() => mapFromFlags(flags({ tiling: '2' }))).toThrow(/--tiling 需要 a,b/);
    expect(() => mapFromFlags(flags({ tiling: '0,2' }))).toThrow(/--tiling 需要正数/);
  });
});
