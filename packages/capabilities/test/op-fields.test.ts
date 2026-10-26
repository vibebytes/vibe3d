import { opSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { opExample } from '../src/op-example';
import { mergedFieldDocs, opFieldDoc, opFieldDocs } from '../src/op-fields';

const arms = (
  opSchema as unknown as { _def: { options: Array<{ shape: Record<string, { _def: { value: unknown } }> }> } }
)._def.options;
const OPS = arms.map((arm) => String(arm.shape.op?._def.value));

describe('op field docs', () => {
  it('covers every op with field docs', () => {
    expect(OPS).toHaveLength(24);
    for (const op of OPS) {
      const docs = opFieldDocs(op);
      expect(docs.length, `${op} has no field docs`).toBeGreaterThan(0);
      expect(docs.some((doc) => doc.path === 'op' && doc.required)).toBe(true);
    }
  });

  it('documents nested and discriminated fields', () => {
    const node = opFieldDoc('node.create', ['node']);
    expect(node?.required).toBe(true);
    expect(node?.type).toContain('mesh');
    const kind = opFieldDoc('node.create', ['node', 'kind']);
    expect(kind?.required).toBe(true);
    const size = opFieldDoc('node.create', ['node', 'size']);
    expect(size?.path).toContain('node');
    const fog = opFieldDoc('env.set', ['env', 'fog']);
    expect(fog?.path).toBe('env.fog');
  });

  it('builds a parse-valid example for every op', () => {
    for (const op of OPS) {
      const example = opExample(op);
      expect(example, `${op} has no example`).toBeDefined();
      const parsed = opSchema.safeParse(JSON.parse(example ?? '{}'));
      expect(parsed.success, `${op} example invalid: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('merges variant paths and keeps every kind visible', () => {
    const merged = mergedFieldDocs('node.create');
    const paths = merged.map((doc) => doc.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('node.geometry.type');
    expect(paths).toContain('node.light.type');
    expect(paths).toContain('node.material');
    expect(merged.length).toBeLessThanOrEqual(60);
    expect(opFieldDocs('node.create').length).toBeGreaterThan(merged.length);
    const parent = merged.find((doc) => doc.path === 'node.parent');
    expect(parent?.type).toBe('string');
    const height = merged.find((doc) => doc.path === 'node.geometry.height');
    expect(height?.required).toBe(false);
    expect(height?.description).toContain('分支');
  });

  it('keeps fields shared by every branch required', () => {
    const merged = mergedFieldDocs('node.create');
    const required = new Map(merged.map((doc) => [doc.path, doc.required]));
    expect(required.get('node')).toBe(true);
    expect(required.get('node.name')).toBe(true);
    expect(required.get('node.transform')).toBe(true);
    expect(required.get('node.kind')).toBe(true);
    expect(required.get('node.geometry')).toBe(false);
    expect(required.get('node.sha')).toBe(false);
    const geometry = merged.find((doc) => doc.path === 'node.geometry');
    expect(geometry?.description).toContain('kind=mesh');
  });

  it('keeps node.create example minimal and explicit', () => {
    const example = JSON.parse(opExample('node.create') ?? '{}');
    expect(example.op).toBe('node.create');
    expect(example.node.kind).toBeDefined();
    expect(example.node.geometry?.type).toBeDefined();
    expect(example.node.visible).not.toBe(false);
  });

  it('expands material objects and avoids invisible samples', () => {
    const paths = mergedFieldDocs('material.set').map((doc) => doc.path);
    expect(paths).toContain('material.baseColor');
    expect(paths).toContain('material.roughness');
    const example = JSON.parse(opExample('material.set') ?? '{}');
    expect(example.material.opacity).toBe(1);
  });
});
