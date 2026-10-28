import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { coerceForSchema } from '../src/coerce';

const ok = <T>(parsed: { success: boolean; data?: unknown }): T => {
  expect(parsed.success).toBe(true);
  return parsed.data as T;
};

const parse = (capability: keyof typeof CAPABILITIES, input: Record<string, unknown>) => {
  const spec = CAPABILITIES[capability];
  return spec.input.safeParse(coerceForSchema(spec.input, input)) as { success: boolean; data?: unknown };
};

describe('colour coercion', () => {
  it('pads a three number colour with alpha 1', () => {
    const data = ok<{ background: number[] }>(
      parse('env.set', { roomId: 'r_0000000a', background: [0.1, 0.2, 0.3] }),
    );
    expect(data.background).toEqual([0.1, 0.2, 0.3, 1]);
  });

  it('accepts #RRGGBB where rgba is expected', () => {
    const data = ok<{ background: number[] }>(
      parse('env.set', { roomId: 'r_0000000a', background: '#5fe3c0' }),
    );
    expect(data.background[0]).toBeCloseTo(0x5f / 255, 5);
    expect(data.background[2]).toBeCloseTo(0xc0 / 255, 5);
    expect(data.background[3]).toBe(1);
  });

  it('accepts #RRGGBBAA and keeps alpha', () => {
    const data = ok<{ background: number[] }>(
      parse('env.set', { roomId: 'r_0000000a', background: '#00000080' }),
    );
    expect(data.background[3]).toBeCloseTo(0x80 / 255, 3);
  });
});

describe('default filling', () => {
  it('completes a partial material on create_node', () => {
    const data = ok<{ material: Record<string, unknown> }>(
      parse('node.create', {
        roomId: 'r_0000000a',
        kind: 'mesh',
        shape: 'box',
        material: { baseColor: [0.8, 0.2, 0.2] },
      }),
    );
    expect(data.material.metalness).toBe(0);
    expect(data.material.roughness).toBe(0.5);
    expect(data.material.opacity).toBe(1);
    expect(data.material.baseColor).toEqual([0.8, 0.2, 0.2, 1]);
  });

  it('fills a missing transform on apply_ops node.create', () => {
    const data = ok<{ ops: Array<{ node: Record<string, unknown> }> }>(
      parse('ops.apply', {
        roomId: 'r_0000000a',
        ops: [
          {
            op: 'node.create',
            node: {
              id: 'n_0000000a',
              name: 'box',
              kind: 'mesh',
              geometry: { type: 'box', size: [1, 1, 1] },
              material: 'm_0000000a',
            },
          },
        ],
      }),
    );
    const node = data.ops[0]!.node;
    expect(node.transform).toEqual({ p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
    expect(node.visible).toBe(true);
  });
});

describe('host stringified scalars', () => {
  it('accepts the string false for env.set fog', () => {
    const data = ok<{ fog?: unknown }>(parse('env.set', { roomId: 'r_0000000a', fog: 'false' }));
    expect(data.fog).toBe(false);
  });

  it('accepts the string null for env.set fog', () => {
    const data = ok<{ fog?: unknown }>(parse('env.set', { roomId: 'r_0000000a', fog: 'null' }));
    expect(data.fog).toBeNull();
  });

  it('accepts the string true for a boolean capability flag', () => {
    const data = ok<{ transparent?: boolean }>(
      parse('render.snapshot', { roomId: 'r_0000000a', transparent: 'true' }),
    );
    expect(data.transparent).toBe(true);
  });

  it('coerces stringified booleans and nulls inside apply_ops patches', () => {
    const data = ok<{ ops: Array<{ node?: Record<string, unknown>; patch?: Record<string, unknown> }> }>(
      parse('ops.apply', {
        roomId: 'r_0000000a',
        ops: [{ op: 'node.update', id: 'n_0000000a', patch: { visible: 'false', tags: 'null' } }],
      }),
    );
    expect(data.ops[0]!.patch).toMatchObject({ visible: false, tags: null });
  });
});
