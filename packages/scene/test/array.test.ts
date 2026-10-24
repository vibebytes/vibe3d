import type { Transform } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { type Placement, arrayPlacements } from '../src/array';

const base: Transform = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] };
const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code;

const near = (a: number[], b: number[], digits = 6): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) expect(a[i]!).toBeCloseTo(b[i]!, digits);
};

const pos = (out: Placement[], i: number): number[] => out[i]!.translate;
const rot = (out: Placement[], i: number): number[] => out[i]!.rotate;

const attempt = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
};

describe('arrayPlacements', () => {
  it('linear keeps the old semantics: offset × i, rotateStep × i, jitter bounded', () => {
    const out = arrayPlacements(base, { count: 3, offset: [1, 0, 0], rotateStep: [0, 30, 0] });
    expect(out).toHaveLength(3);
    near(pos(out, 0), [1, 0, 0]);
    near(pos(out, 1), [2, 0, 0]);
    near(pos(out, 2), [3, 0, 0]);
    near(rot(out, 0), [0, 30, 0]);
    near(rot(out, 2), [0, 90, 0]);

    const jittered = arrayPlacements(base, { count: 3, offset: [1, 0, 0], jitter: [0.2, 0, 0.2] });
    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs(pos(jittered, i)[0]! - (i + 1))).toBeLessThanOrEqual(0.2);
      expect(Math.abs(pos(jittered, i)[2]!)).toBeLessThanOrEqual(0.2);
    }
    expect(pos(jittered, 1)[0]).not.toBe(2);
  });

  it('linear without offset is rejected instead of silently stacking copies on the source', () => {
    expect(codeOf(attempt(() => arrayPlacements(base, { count: 2 })))).toBe('E_INVALID_PARAMS');
  });

  it('grid fills rows of `cols`, skipping the slot the source already owns', () => {
    const out = arrayPlacements(base, { mode: 'grid', count: 5, cols: 3, offset: [2, 0, 4] });
    expect(out).toHaveLength(5);
    near(pos(out, 0), [2, 0, 0]);
    near(pos(out, 1), [4, 0, 0]);
    near(pos(out, 2), [0, 0, 4]);
    near(pos(out, 3), [2, 0, 4]);
    near(pos(out, 4), [4, 0, 4]);
  });

  it('grid rejects cols < 1 and a missing offset', () => {
    expect(codeOf(attempt(() => arrayPlacements(base, { mode: 'grid', count: 2, cols: 0, offset: [1, 0, 0] })))).toBe(
      'E_INVALID_PARAMS',
    );
    expect(codeOf(attempt(() => arrayPlacements(base, { mode: 'grid', count: 2, cols: 2 })))).toBe('E_INVALID_PARAMS');
  });

  it('radial spreads the source and the copies evenly over one turn by default', () => {
    const out = arrayPlacements(base, { mode: 'radial', count: 3, radius: 2 });
    expect(out).toHaveLength(3);
    near(pos(out, 0), [0, 0, -2]);
    near(pos(out, 1), [-2, 0, 0]);
    near(pos(out, 2), [0, 0, 2]);
    near(rot(out, 0), [0, 90, 0]);
    near(rot(out, 2), [0, 270, 0]);
  });

  it('radial honours sweep, axis and an explicit centre on the ring', () => {
    const half = arrayPlacements(base, { mode: 'radial', count: 1, radius: 1, sweep: 180 });
    near(pos(half, 0), [0, 0, -1]);
    near(rot(half, 0), [0, 90, 0]);

    const zAxis = arrayPlacements(base, { mode: 'radial', count: 1, radius: 1, sweep: 90, axis: 'z' });
    near(pos(zAxis, 0), [0.7071068, 0.7071068, 0]);
    near(rot(zAxis, 0), [0, 0, 45]);

    const xAxis = arrayPlacements(base, { mode: 'radial', count: 1, radius: 1, sweep: 90, axis: 'x' });
    near(pos(xAxis, 0), [0, 0.7071068, 0.7071068]);
    near(rot(xAxis, 0), [45, 0, 0]);
  });

  it('radial with a centre swings the source around it and keeps its radius', () => {
    const onRing: Transform = { p: [0, 0, 2], r: [0, 0, 0], s: [1, 1, 1] };
    const out = arrayPlacements(onRing, { mode: 'radial', count: 1, sweep: 90, center: [0, 0, 0] });
    near(pos(out, 0), [1.4142136, 0, -0.5857864]);
    near(rot(out, 0), [0, 45, 0]);
  });

  it('radial rejects a missing radius, a non-positive radius, and a centre that contradicts radius', () => {
    expect(codeOf(attempt(() => arrayPlacements(base, { mode: 'radial', count: 2 })))).toBe('E_INVALID_PARAMS');
    expect(codeOf(attempt(() => arrayPlacements(base, { mode: 'radial', count: 2, radius: 0 })))).toBe(
      'E_INVALID_PARAMS',
    );
    const offRing: Transform = { p: [0, 0, 2], r: [0, 0, 0], s: [1, 1, 1] };
    expect(
      codeOf(attempt(() => arrayPlacements(offRing, { mode: 'radial', count: 1, radius: 3, center: [0, 0, 0] }))),
    ).toBe('E_INVALID_PARAMS');
  });

  it('count 0 yields no placements instead of throwing', () => {
    expect(arrayPlacements(base, { count: 0, offset: [1, 0, 0] })).toEqual([]);
  });
});
