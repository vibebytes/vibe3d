import { describe, expect, it } from 'vitest';
import { parseLookFlags } from '../src/look';

describe('CLI 渲染外观标志', () => {
  it('未给标志时返回空对象', () => {
    expect(parseLookFlags({})).toEqual({});
  });

  it('解析 --shading 五种取值', () => {
    for (const mode of ['flat', 'wireframe', 'normals', 'material', 'rendered'] as const) {
      expect(parseLookFlags({ shading: mode })).toEqual({ shading: mode });
    }
  });

  it('--overlay 支持逗号列表并去重', () => {
    expect(parseLookFlags({ overlay: 'grid,axes,bbox' })).toEqual({ overlay: ['grid', 'axes', 'bbox'] });
    expect(parseLookFlags({ overlay: 'bbox,bbox' })).toEqual({ overlay: ['bbox'] });
  });

  it('--overlay 接受诊断类叠加（ground/centerline/scale/normal）', () => {
    expect(parseLookFlags({ overlay: 'ground,scale' })).toEqual({ overlay: ['ground', 'scale'] });
  });

  it('非法取值抛错并列出合法值', () => {
    expect(() => parseLookFlags({ shading: 'toon' })).toThrow(/shading/);
    expect(() => parseLookFlags({ overlay: 'grid+camera' })).toThrow(/overlay/);
  });

  it('--no-overlay 视为关闭', () => {
    expect(parseLookFlags({ overlay: false })).toEqual({});
  });
});
