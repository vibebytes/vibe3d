import { describe, expect, it } from 'vitest';
import { viewportFogPlan } from '../src/shot-meta';

const doc = { color: 0x0b0f14, near: 6, far: 40 };

describe('viewportFogPlan', () => {
  it('returns null without doc fog', () => {
    expect(viewportFogPlan(null, 10, 5)).toBeNull();
    expect(viewportFogPlan(undefined, 10, 5)).toBeNull();
  });

  it('keeps authored near/far inside the authored range', () => {
    expect(viewportFogPlan(doc, 10, 5)).toEqual({ color: doc.color, near: 6, far: 40, source: 'doc' });
  });

  it('extends far while zooming out so the subject is never swallowed', () => {
    const plan = viewportFogPlan(doc, 200, 10);
    expect(plan?.source).toBe('auto');
    expect(plan?.far).toBeGreaterThanOrEqual(200 + 10 * 3);
    expect(plan?.near).toBe(6);
    expect(plan?.color).toBe(doc.color);
  });

  it('covers large subjects even when close', () => {
    expect(viewportFogPlan(doc, 10, 100)?.far).toBeGreaterThanOrEqual(10 + 100 * 3);
  });

  it('clamps non-finite inputs', () => {
    expect(viewportFogPlan(doc, Number.NaN, Number.NaN)).toEqual({
      color: doc.color,
      near: 6,
      far: 40,
      source: 'doc',
    });
  });
});
