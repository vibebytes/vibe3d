import { describe, expect, it } from 'vitest';
import { paramHint } from '../src/hints';
import { ToolRuntime } from '../src/tools';

const fakeStudio = () =>
  ({
    client: { call: async () => ({}) },
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: () => ({ invoke: async () => ({}) }),
  }) as never;

describe('param hints', () => {
  it('explains the material id shape and the generated alternative', () => {
    const hint = paramHint([{ path: ['ops', 2, 'node', 'material'], message: 'invalid material id' }]);
    expect(hint).toContain('m_');
    expect(hint).toContain('8');
    expect(hint).toContain('vibe3d_create_material');
  });

  it('explains rgba when a colour is short', () => {
    const hint = paramHint([
      { path: ['ops', 1, 'env', 'background'], message: 'Array must contain at least 4 element(s)' },
    ]);
    expect(hint).toContain('[r,g,b,a]');
  });

  it('stays quiet for unrelated issues', () => {
    expect(paramHint([{ path: ['ops'], message: 'Required' }])).toBe('');
  });

  it('tells the model to nest a composite payload under its wrapper field', () => {
    const hint = paramHint([{ path: ['ops', 1, 'node'], message: 'Required' }]);
    expect(hint).toContain('node:{');
    expect(hint).toContain('apply_ops');
  });

  it('uses the failing op name in the nesting hint', () => {
    const hint = paramHint([{ path: ['ops', 0, 'env'], message: 'Required' }], 'env.set');
    expect(hint).toContain('env.set');
    expect(hint).toContain('env:{');
  });

  it('explains the node kind discriminator', () => {
    const hint = paramHint([{ path: ['ops', 0, 'node', 'kind'], message: 'Invalid discriminator value' }]);
    expect(hint).toContain('group / mesh / light / model');
  });

  it('suggests the nearest op name when the op is misspelled', () => {
    const hint = paramHint([{ path: ['ops', 0, 'op'], message: 'Invalid discriminator value' }], 'node.mak');
    expect(hint).toContain('node.create');
    expect(hint).toContain('vibe3d_help');
    expect(hint).not.toContain('group / mesh / light');
  });

  it('lists the missing fields instead of claiming a flat payload when the wrapper is present', () => {
    const hint = paramHint(
      [
        { path: ['ops', 0, 'node'], message: 'Required' },
        { path: ['ops', 0, 'node', 'visible'], message: 'Required' },
        { path: ['ops', 0, 'node', 'transform'], message: 'Required' },
      ],
      'node.create',
      { op: 'node.create', node: { kind: 'mesh' } },
    );
    expect(hint).toContain('缺必填字段');
    expect(hint).toContain('visible');
    expect(hint).toContain('transform');
    expect(hint).not.toContain('不能平铺');
  });
});

describe('field shape hints', () => {
  it('explains that fog is an object, not a boolean', () => {
    const hint = paramHint([{ path: ['fog'], message: 'Invalid input' }]);
    expect(hint).toContain('near');
    expect(hint).toContain('far');
    expect(hint).toContain('false');
  });

  it('explains geometry and material for a nested node payload', () => {
    const geometry = paramHint([{ path: ['ops', 0, 'node', 'geometry'], message: 'Invalid input' }]);
    expect(geometry).toContain('size');
    expect(geometry).toContain('plane');
    expect(geometry).toContain('radius');
    expect(geometry).toContain('shape');
    const material = paramHint([{ path: ['ops', 0, 'node', 'material'], message: 'Required' }]);
    expect(material).toContain('m_');
    expect(material).toContain('create');
  });

  it('keeps the node id hint ahead of the generic id shape', () => {
    const hint = paramHint([{ path: ['ops', 0, 'node', 'material'], message: 'invalid material id' }]);
    expect(hint).toContain('vibe3d_create_material');
  });

  it('explains a size array that is too short', () => {
    const hint = paramHint([
      { path: ['size'], message: 'Array must contain at least 3 element(s), inclusive' },
    ]);
    expect(hint).toContain('[x,y,z]');
  });

  it('repeats the nesting rule when a flat payload leaves node half-built', () => {
    const hint = paramHint(
      [
        { path: ['ops', 0, 'node', 'parent'], message: 'Invalid input' },
        { path: ['ops', 0, 'node', 'geometry'], message: 'Invalid input' },
        { path: ['ops', 0, 'node', 'material'], message: 'Required' },
      ],
      'node.create',
    );
    expect(hint).toContain('包在 node 里');
    expect(hint).toContain('node.create');
  });
});

describe('failure text', () => {
  it('appends the id hint to a real tool failure', async () => {
    const runtime = new ToolRuntime(fakeStudio());
    const used = await runtime.call('vibe3d_use_room', { roomId: 'r_0000000a' });
    expect(used.isError).toBeFalsy();
    const result = await runtime.call('vibe3d_apply_ops', {
      ops: [
        {
          op: 'node.create',
          node: {
            id: 'bad',
            name: 'box',
            kind: 'mesh',
            geometry: { type: 'box', size: [1, 1, 1] },
            material: 'm_0000000a',
          },
        },
      ],
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('节点 id 形如 n_');
  });
});
