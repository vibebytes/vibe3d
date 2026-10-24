import { describe, expect, it } from 'vitest';
import { parseLookFlags } from '../src/look';

describe('CLI 渲染外观标志', () => {
  it('未给标志时返回空对象', () => {
    expect(parseLookFlags({})).toEqual({});
  });

  it('解析 --shading 三种取值', () => {
    expect(parseLookFlags({ shading: 'flat' })).toEqual({ shading: 'flat' });
    expect(parseLookFlags({ shading: 'wireframe' })).toEqual({ shading: 'wireframe' });
    expect(parseLookFlags({ shading: 'normals' })).toEqual({ shading: 'normals' });
  });

  it('--overlay 支持逗号列表并去重', () => {
    expect(parseLookFlags({ overlay: 'grid,axes,bbox' })).toEqual({ overlay: ['grid', 'axes', 'bbox'] });
    expect(parseLookFlags({ overlay: 'bbox,bbox' })).toEqual({ overlay: ['bbox'] });
  });

  it('非法取值抛错并列出合法值', () => {
    expect(() => parseLookFlags({ shading: 'material' })).toThrow(/shading/);
    expect(() => parseLookFlags({ overlay: 'grid+camera' })).toThrow(/overlay/);
  });

  it('--no-overlay 视为关闭', () => {
    expect(parseLookFlags({ overlay: false })).toEqual({});
  });
});
