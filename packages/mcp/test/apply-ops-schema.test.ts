import { opSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { OP_NAMES, applyOpsSchema } from '../src/presentation';

type Loose = {
  properties: {
    ops: {
      description: string;
      items: { properties?: { op?: { enum?: string[] } } };
      examples?: unknown[];
    };
  };
};

const schema = applyOpsSchema() as Loose;

describe('apply_ops schema guidance', () => {
  it('names every op the batch accepts', () => {
    const names = schema.properties.ops.items.properties?.op?.enum ?? [];
    expect(names).toEqual([...OP_NAMES]);
    expect(names).toContain('node.create');
    expect(names).toContain('env.set');
    expect(names.length).toBeGreaterThanOrEqual(20);
  });

  it('spells out that composite payloads nest under a same-named field', () => {
    const desc = schema.properties.ops.description;
    expect(desc).toContain('node:{');
    expect(desc).toContain('env:{');
    expect(desc).toContain('stage:{');
    expect(desc).toMatch(/不能平铺/);
  });

  it('ships examples that pass the real op schema', () => {
    const examples = schema.properties.ops.examples ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(3);
    const bad = examples
      .map((example, index) => ({ index, parsed: opSchema.safeParse(example) }))
      .filter(({ parsed }) => !parsed.success)
      .map(({ index, parsed }) => ({ index, issues: parsed.success ? [] : parsed.error.issues }));
    expect(bad).toEqual([]);
  });

  it('keeps the advertised schema small enough for the tool budget', () => {
    expect(JSON.stringify(schema).length).toBeLessThanOrEqual(6 * 1024);
  });
});
