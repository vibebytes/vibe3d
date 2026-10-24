import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../src/reduce';

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return '';
};

describe('duplicate id hints', () => {
  it('points fx.create duplicates at the generating tool', () => {
    const fx = { id: 'f_0000000a', type: 'particles' as const };
    const once = applyOps(emptyDoc(), [{ op: 'fx.create', fx }]);
    const text = message(() => applyOps(once.doc, [{ op: 'fx.create', fx }]));
    expect(text).toContain('特效已存在');
    expect(text).toContain('vibe3d_create_fx');
  });

  it('points material duplicates at the generating tool', () => {
    const once = applyOps(emptyDoc(), [{ op: 'material.create', id: 'm_0000000a', preset: 'rust' }]);
    const text = message(() =>
      applyOps(once.doc, [{ op: 'material.create', id: 'm_0000000a', preset: 'rust' }]),
    );
    expect(text).toContain('材质已存在');
    expect(text).toContain('vibe3d_create_material');
  });
});
