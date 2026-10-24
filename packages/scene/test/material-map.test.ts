import { describe, expect, it } from 'vitest';
import { applyUv, normalizeMap, uvMatrix } from '../src/index';

describe('applyUv', () => {
  it('is identity with no options', () => {
    expect(applyUv({ sha: 'a'.repeat(64) }, [0.25, 0.75])).toEqual([0.25, 0.75]);
  });

  it('scales by tiling', () => {
    expect(applyUv({ tiling: [2, 3] }, [0.25, 0.5])).toEqual([0.5, 1.5]);
  });

  it('translates by offset after scaling', () => {
    expect(applyUv({ tiling: [2, 2], offset: [0.1, 0.2] }, [0.25, 0.5])).toEqual([0.6, 1.2]);
  });

  it('rotates around the uv centre', () => {
    const [u, v] = applyUv({ rotation: Math.PI / 2 }, [0.6, 0.5]);
    expect(u).toBeCloseTo(0.5, 12);
    expect(v).toBeCloseTo(0.6, 12);
  });

  it('applies rotation after scale and before offset', () => {
    const [u, v] = applyUv({ tiling: [2, 2], rotation: Math.PI / 2 }, [0.6, 0.5]);
    expect(u).toBeCloseTo(0, 12);
    expect(v).toBeCloseTo(1.2, 12);
  });
});

describe('uvMatrix', () => {
  it('matches applyUv for every corner', () => {
    const map = { tiling: [2, 2] as [number, number], offset: [0.1, 0.2] as [number, number], rotation: 0.3 };
    const m = uvMatrix(map);
    for (const pt of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [number, number][]) {
      const [u, v] = applyUv(map, pt);
      expect(m[0] * pt[0] + m[2] * pt[1] + m[4]).toBeCloseTo(u, 12);
      expect(m[1] * pt[0] + m[3] * pt[1] + m[5]).toBeCloseTo(v, 12);
    }
  });
});

describe('normalizeMap', () => {
  it('lifts a legacy string map to an object', () => {
    const sha = 'b'.repeat(64);
    expect(normalizeMap(sha)).toEqual({ sha });
  });

  it('keeps object maps intact', () => {
    const map = { sha: 'c'.repeat(64), tiling: [4, 4] as [number, number] };
    expect(normalizeMap(map)).toEqual(map);
  });

  it('returns undefined for missing maps', () => {
    expect(normalizeMap(undefined)).toBeUndefined();
  });

  it('flattens nested uv transforms', () => {
    const map = {
      sha: 'd'.repeat(64),
      uv: { repeat: [2, 3] as [number, number], offset: [0.1, 0.2] as [number, number], rotation: 0.5, channel: 1 as const },
    };
    expect(normalizeMap(map)).toEqual({
      sha: 'd'.repeat(64),
      tiling: [2, 3],
      offset: [0.1, 0.2],
      rotation: 0.5,
      channel: 1,
    });
  });

  it('lets nested uv win over flat fields', () => {
    const map = {
      sha: 'e'.repeat(64),
      tiling: [4, 4] as [number, number],
      uv: { repeat: [2, 2] as [number, number] },
    };
    expect(normalizeMap(map)).toEqual({ sha: 'e'.repeat(64), tiling: [2, 2] });
  });

  it('accepts channel without uv', () => {
    const map = { sha: 'f'.repeat(64), channel: 1 as const };
    expect(normalizeMap(map)).toEqual({ sha: 'f'.repeat(64), channel: 1 });
  });
});
