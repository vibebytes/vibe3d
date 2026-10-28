import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { coerceForSchema } from '../src/coerce';
import { repairInput } from '../src/repair';

const spec = (CAPABILITIES as unknown as Record<string, { input: Parameters<typeof repairInput>[0] }>)[
  'ops.apply'
]!.input;

const parse = (payload: Record<string, unknown>) => {
  const repaired = repairInput(spec, { roomId: 'r_0000000a', ...payload });
  return {
    repaired,
    result: (spec as never as { safeParse: (v: unknown) => any }).safeParse(
      coerceForSchema(spec, repaired.value),
    ),
  };
};

const node = (patch: Record<string, unknown> = {}) => ({
  op: 'node.create',
  node: {
    kind: 'mesh',
    name: 'box',
    parent: null,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    geometry: { type: 'box', size: [1, 1, 1] },
    material: 'm_00000000',
    ...patch,
  },
});

describe('apply_ops 自动修复', () => {
  it('turns a snake_case op name into the dotted one', () => {
    const { repaired, result } = parse({ ops: [{ ...node(), op: 'node_create' }] });
    expect(result.success).toBe(true);
    expect(repaired.fixes.join(' ')).toContain('node_create→node.create');
  });

  it('accepts geometry written with kind instead of type', () => {
    const { repaired, result } = parse({
      ops: [node({ geometry: { kind: 'box', size: [1, 1, 1] } })],
    });
    expect(result.success).toBe(true);
    expect(repaired.fixes.join(' ')).toContain('kind→type');
  });

  it('maps 0-255 colour channels into the 0..1 range', () => {
    const { result } = parse({
      ops: [{ op: 'env.set', env: { fog: { near: 1, far: 10, color: [255, 128, 0] } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].env.fog.color[0]).toBeCloseTo(1);
    expect(result.data.ops[0].env.fog.color[2]).toBeCloseTo(0);
  });

  it('reads fog.enabled:false as turning fog off', () => {
    const { result } = parse({
      ops: [{ op: 'env.set', env: { fog: { enabled: false, near: 1, far: 10 } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].env.fog).toBeNull();
  });

  it('infers node.kind from the payload instead of demanding it', () => {
    const { repaired, result } = parse({
      ops: [{ op: 'node.create', node: { name: 'ball', geometry: { type: 'sphere', radius: 1 } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].node.kind).toBe('mesh');
    expect(repaired.fixes.join(' ')).toContain('kind:缺省→mesh');
  });

  it('infers geometry.type from its fields', () => {
    const { result } = parse({
      ops: [{ op: 'node.create', node: { name: 'ball', geometry: { radius: 1 } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].node.geometry.type).toBe('sphere');
  });

  it('lifts a flat legacy shape/size payload into node.geometry', () => {
    const { repaired, result } = parse({
      ops: [{ op: 'node.create', kind: 'mesh', name: 'box', shape: 'box', size: [1, 2, 3] }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].node.geometry).toEqual({ type: 'box', size: [1, 2, 3] });
    expect(repaired.fixes.join(' ')).toContain('shape,size→geometry');
  });

  it('maps a cube synonym onto box', () => {
    const { result } = parse({
      ops: [{ op: 'node.create', node: { name: 'cube', geometry: { type: 'cube', size: [1, 1, 1] } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].node.geometry.type).toBe('box');
  });

  it('accepts type instead of op on an ops item', () => {
    const { repaired, result } = parse({
      ops: [{ type: 'node.create', node: { name: 'ball', geometry: { type: 'sphere', radius: 1 } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].op).toBe('node.create');
    expect(repaired.fixes.join(' ')).toContain('type→op');
  });

  it('maps create_node onto node.create', () => {
    const { repaired, result } = parse({
      ops: [{ op: 'create_node', node: { name: 'ball', geometry: { type: 'sphere', radius: 1 } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].op).toBe('node.create');
    expect(repaired.fixes.join(' ')).toContain('create_node→node.create');
  });

  it('repairs a one-keystroke typo in the op name', () => {
    const { repaired, result } = parse({
      ops: [{ op: 'node.creat', node: { name: 'x', geometry: { type: 'box', size: [1, 1, 1] } } }],
    });
    expect(result.success).toBe(true);
    expect(result.data.ops[0].op).toBe('node.create');
    expect(repaired.fixes.join(' ')).toContain('node.creat→node.create');
  });

  it('does not mistake a node kind for an op name', () => {
    const { repaired, result } = parse({
      ops: [{ kind: 'mesh', name: 'box', shape: 'box', size: [1, 1, 1] }],
    });
    expect(result.success).toBe(false);
    expect(repaired.fixes.join(' ')).not.toContain('kind→op');
  });
});

describe('node.create 扁平入参', () => {
  const spec = (CAPABILITIES as unknown as Record<string, { input: Parameters<typeof repairInput>[0] }>)[
    'node.create'
  ]!.input;
  const parse = (payload: Record<string, unknown>) => {
    const repaired = repairInput(spec, { roomId: 'r_0000000a', ...payload });
    return {
      repaired,
      result: (spec as never as { safeParse: (v: unknown) => any }).safeParse(
        coerceForSchema(spec, repaired.value),
      ),
    };
  };

  it('flattens a geometry object into shape/radius', () => {
    const { repaired, result } = parse({
      kind: 'mesh',
      name: 'ball',
      geometry: { type: 'sphere', radius: 1 },
    });
    expect(result.success).toBe(true);
    expect(result.data.shape).toBe('sphere');
    expect(result.data.radius).toBeCloseTo(1);
    expect(repaired.fixes.join(' ')).toContain('geometry.{type,radius}→扁平字段');
  });

  it('keeps a mesh payload out of the light bag when the op came in as type', () => {
    const { repaired, result } = parse({
      type: 'create',
      kind: 'mesh',
      name: 'box6',
      shape: 'box',
      size: [1, 1, 1],
    });
    expect(result.success).toBe(true);
    expect(result.data.kind).toBe('mesh');
    expect(result.data.light).toBeUndefined();
    expect(repaired.fixes.join(' ')).not.toContain('→light.');
  });

  it('still folds light fields into the light bag', () => {
    const { repaired } = parse({ kind: 'light', type: 'point', intensity: 2 });
    expect(repaired.fixes.join(' ')).toContain('type,intensity→light.{type,intensity}');
  });

  it('unwraps a node bag into the flat payload', () => {
    const { repaired, result } = parse({
      node: { kind: 'mesh', name: 'box', shape: 'box', size: [1, 2, 3] },
    });
    expect(result.success).toBe(true);
    expect(result.data.kind).toBe('mesh');
    expect(result.data.size).toEqual([1, 2, 3]);
    expect(repaired.fixes.join(' ')).toContain('node.{kind,name,shape,size}→(unwrapped)');
  });
});
