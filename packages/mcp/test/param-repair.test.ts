import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { coerceForSchema } from '../src/coerce';
import { repairInput } from '../src/repair';

const parse = (capability: keyof typeof CAPABILITIES, input: Record<string, unknown>) => {
  const spec = CAPABILITIES[capability];
  const repaired = repairInput(spec.input, { roomId: 'r_0000000a', ...input });
  return spec.input.safeParse(coerceForSchema(spec.input, repaired.value)) as {
    success: boolean;
    data?: Record<string, unknown>;
  };
};

const ok = (capability: keyof typeof CAPABILITIES, input: Record<string, unknown>) => {
  const parsed = parse(capability, input);
  expect(parsed.success, JSON.stringify(parsed)).toBe(true);
  return parsed.data ?? {};
};

describe('required id adoption', () => {
  it('maps a bare id to node.get nodeId', () => {
    expect(ok('node.get', { id: 'n_abcdef12' }).nodeId).toBe('n_abcdef12');
  });

  it('maps node_id to node.get nodeId', () => {
    expect(ok('node.get', { node_id: 'n_abcdef12' }).nodeId).toBe('n_abcdef12');
  });

  it('adopts a value-only node id under an unknown key', () => {
    expect(ok('node.get', { target: 'n_abcdef12' }).nodeId).toBe('n_abcdef12');
  });

  it('maps id to job.get jobId', () => {
    expect(ok('job.get', { id: '05070360a57a4446' }).jobId).toBe('05070360a57a4446');
  });

  it('adopts a lone hex string as jobId', () => {
    expect(ok('job.get', { task: '05070360a57a4446' }).jobId).toBe('05070360a57a4446');
  });

  it('keeps an already correct nodeId untouched', () => {
    expect(ok('node.get', { nodeId: 'n_abcdef12' }).nodeId).toBe('n_abcdef12');
  });
});

describe('nested object adoption', () => {
  it('collects camera p/target/fov from the top level', () => {
    const data = ok('camera.set', { p: [0, 1.5, 7], target: [0, 1, 0], fov: 31 });
    expect(data.camera).toEqual({ p: [0, 1.5, 7], target: [0, 1, 0], fov: 31 });
    expect(data).not.toHaveProperty('p');
  });

  it('leaves an explicit camera object alone', () => {
    const data = ok('camera.set', { camera: { p: [1, 2, 3] }, frame: 'fit' });
    expect(data.camera).toEqual({ p: [1, 2, 3] });
  });

  it('unwraps a single node wrapper on ops.apply', () => {
    const data = ok('ops.apply', {
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
    });
    expect(Array.isArray(data.ops)).toBe(true);
  });

  it('wraps a flattened node.create op item', () => {
    const data = ok('ops.apply', {
      ops: [
        {
          op: 'node.create',
          kind: 'mesh',
          name: 'box',
          geometry: { type: 'box', size: [1, 1, 1] },
          material: 'm_0000000a',
          p: [1, 2, 3],
        },
      ],
    });
    const node = (data.ops as Array<{ node: Record<string, unknown> }>)[0]!.node;
    expect(node.name).toBe('box');
    expect(node.geometry).toEqual({ type: 'box', size: [1, 1, 1] });
    expect(node).not.toHaveProperty('p');
    expect(node.transform).toEqual({ p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] });
  });

  it('completes a partial transform inside node.create', () => {
    const data = ok('ops.apply', {
      ops: [
        {
          op: 'node.create',
          node: {
            id: 'n_0000000a',
            name: 'box',
            kind: 'mesh',
            geometry: { type: 'box', size: [1, 1, 1] },
            material: 'm_0000000a',
            transform: { p: [1, 2, 3] },
          },
        },
      ],
    });
    const node = (data.ops as Array<{ node: { transform: Record<string, unknown> } }>)[0]!.node;
    expect(node.transform).toEqual({ p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] });
  });

  it('maps nodeId to the op-level id on node.update', () => {
    const data = ok('ops.apply', {
      ops: [{ op: 'node.update', nodeId: 'n_0000000a', patch: { name: 'renamed' } }],
    });
    const op = (data.ops as Array<Record<string, unknown>>)[0]!;
    expect(op.id).toBe('n_0000000a');
  });

  it('nests a flat p inside a patch', () => {
    const data = ok('node.update', { nodeId: 'n_0000000a', patch: { p: [0, 2, 0] } });
    expect(data.patch).toEqual({ transform: { p: [0, 2, 0] } });
  });

  it('never invents a transform rotation for a patch', () => {
    const data = ok('node.update', { nodeId: 'n_0000000a', patch: { transform: { p: [1, 2, 3] } } });
    expect(data.patch).toEqual({ transform: { p: [1, 2, 3] } });
  });
});

describe('material leniency', () => {
  it('accepts a free-form preset name on material.create', () => {
    const data = ok('material.create', { preset: 'matte-white' });
    expect(data.preset).toBe('matte-white');
  });

  it('accepts material.create without a preset', () => {
    expect(() => ok('material.create', {})).not.toThrow();
  });

  it('accepts node.create without material inside ops.apply', () => {
    const data = ok('ops.apply', {
      ops: [
        {
          op: 'node.create',
          node: {
            id: 'n_0000000a',
            kind: 'mesh',
            name: 'box',
            parent: null,
            visible: true,
            geometry: { type: 'box', size: [1, 1, 1] },
            transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
          },
        },
      ],
    });
    expect(Array.isArray(data.ops)).toBe(true);
  });

  it('accepts the color alias on material.patch and expands a hex string', () => {
    const data = ok('material.patch', { materialId: 'm_0000000a', patch: { color: '#ff0000' } });
    expect(data.patch).toMatchObject({ color: [1, 0, 0, 1] });
  });
});
