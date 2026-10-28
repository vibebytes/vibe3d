import { newNodeSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceForSchema, lenientRecord } from '../src/coerce';

const mesh = {
  kind: 'mesh',
  name: 'box1',
  geometry: { type: 'box', size: [1, 2, 3] },
  material: 'm_12345678',
};

describe('lenient input contracts', () => {
  it('reads params that arrived as a JSON string', () => {
    expect(lenientRecord('{"kind":"mesh","size":[1,2,3]}')).toEqual({ kind: 'mesh', size: [1, 2, 3] });
  });

  it('reads params that arrived as a nested JSON string', () => {
    expect(lenientRecord('{"params":{"kind":"mesh"}}')).toEqual({ kind: 'mesh' });
  });

  it('parses array text into a tuple field', () => {
    expect(coerceForSchema(z.tuple([z.number(), z.number(), z.number()]), '[600,600,1]')).toEqual([
      600, 600, 1,
    ]);
  });

  it('fills parent/visible/transform defaults on a node payload', () => {
    const out = coerceForSchema(newNodeSchema, structuredClone(mesh)) as Record<string, unknown>;
    expect(out.parent).toBeNull();
    expect(out.visible).toBe(true);
    expect(out.transform).toEqual({ p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
  });

  it('reports the field that is really missing, not a bogus parent error', () => {
    const noGeometry = { ...structuredClone(mesh) } as Record<string, unknown>;
    delete noGeometry.geometry;
    const parsed = newNodeSchema.safeParse(coerceForSchema(newNodeSchema, noGeometry));
    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
    expect(paths).toContain('geometry');
    expect(paths).not.toContain('parent');
  });

  it('accepts a mesh payload without material (server fills the default)', () => {
    const noMaterial = { ...structuredClone(mesh) } as Record<string, unknown>;
    delete noMaterial.material;
    const parsed = newNodeSchema.safeParse(coerceForSchema(newNodeSchema, noMaterial));
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.parent : undefined).toBeNull();
  });

  it('keeps a good node intact when the payload is already correct', () => {
    const parsed = newNodeSchema.safeParse(coerceForSchema(newNodeSchema, structuredClone(mesh)));
    expect(parsed.success).toBe(true);
  });
});
