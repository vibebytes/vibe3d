import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, resolveQuality } from '../src/quality';

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;

describe('resolveQuality', () => {
  it('defaults to standard with 4x MSAA and 1024 shadows', () => {
    const q = resolveQuality();
    expect(q).toEqual({
      level: 'standard',
      pixelRatio: 1,
      samples: 4,
      shadowMapSize: 1024,
      supersample: false,
    });
  });

  it('draft trades MSAA and shadow resolution for speed', () => {
    const q = resolveQuality('draft');
    expect(q.level).toBe('draft');
    expect(q.samples).toBe(0);
    expect(q.shadowMapSize).toBeGreaterThanOrEqual(256);
    expect(q.shadowMapSize).toBeLessThan(1024);
    expect(q.supersample).toBe(false);
  });

  it('high supersamples at 2x with 2048 shadows', () => {
    const q = resolveQuality('high');
    expect(q.level).toBe('high');
    expect(q.pixelRatio).toBe(2);
    expect(q.samples).toBeGreaterThanOrEqual(4);
    expect(q.shadowMapSize).toBe(2048);
    expect(q.supersample).toBe(true);
  });

  it('keeps shadow map sizes powers of two', () => {
    for (const level of QUALITY_LEVELS) {
      const size = resolveQuality(level).shadowMapSize;
      expect(Math.log2(size) % 1).toBe(0);
    }
  });

  it('rejects unknown levels with E_INVALID_PARAMS', () => {
    expect(() => resolveQuality('ultra' as never)).toThrowError(/ultra/);
    try {
      resolveQuality('ultra' as never);
    } catch (err) {
      expect(codeOf(err)).toBe('E_INVALID_PARAMS');
    }
  });

  it('lists levels from cheapest to richest', () => {
    expect(QUALITY_LEVELS).toEqual(['draft', 'standard', 'high']);
    const sizes = QUALITY_LEVELS.map((l) => resolveQuality(l).shadowMapSize);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
});
