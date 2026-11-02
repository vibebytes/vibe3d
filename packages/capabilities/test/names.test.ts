import { describe, expect, it } from 'vitest';
import { CAPABILITIES } from '../src/index';
import { kebab, normalized } from '../src/names';

describe('field names', () => {
  it('kebab 拆分驼峰', () => {
    expect(kebab('rotateStep')).toBe('rotate-step');
    expect(kebab('hdriSrc')).toBe('hdri-src');
    expect(kebab('radialSegments')).toBe('radial-segments');
    expect(kebab('maxDistance')).toBe('max-distance');
  });

  it('kebab 保留连续大写为一段', () => {
    expect(kebab('withinBBox')).toBe('within-bbox');
  });

  it('kebab 转换下划线', () => {
    expect(kebab('tolerance_px')).toBe('tolerance-px');
    expect(kebab('max_de')).toBe('max-de');
  });

  it('normalized 让三种写法等价', () => {
    expect(normalized('within-bbox')).toBe('withinbbox');
    expect(normalized('withinBBox')).toBe('withinbbox');
    expect(normalized('within_bbox')).toBe('withinbbox');
  });

  it('全部能力的 input 字段在归一化后不冲突', () => {
    for (const spec of Object.values(CAPABILITIES)) {
      const shape = spec.input.shape as Record<string, unknown> | undefined;
      if (!shape) continue;
      const seen = new Map<string, string>();
      for (const name of Object.keys(shape)) {
        const key = normalized(name);
        const prev = seen.get(key);
        expect(prev, `${name} 与 ${prev} 归一化后相同`).toBeUndefined();
        seen.set(key, name);
      }
    }
  });
});
