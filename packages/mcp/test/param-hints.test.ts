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

  it('explains the node kind discriminator', () => {
    const hint = paramHint([{ path: ['ops', 0, 'node', 'kind'], message: 'Invalid discriminator value' }]);
    expect(hint).toContain('group / mesh / light / model');
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
