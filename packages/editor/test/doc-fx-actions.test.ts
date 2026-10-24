import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: [] as Array<[string, Record<string, unknown>, string]> }));

vi.mock('../src/lib/rpc', () => ({
  rpc: async (method: string, params: Record<string, unknown>, roomId: string) => {
    calls.push([method, params, roomId]);
    if (method === 'scene.get') return { doc: emptyDoc('t') };
    if (method === 'fx.create') return { revision: 2, fxId: 'x_00000001' };
    if (method === 'fx.delete') return { revision: 3, removed: true };
    if (method === 'animation.clear') return { revision: 4, cleared: true };
    return { revision: 2 };
  },
}));

const { useDoc } = await import('../src/stores/doc');

const FACTS = { type: 'particles', rate: 20 } as const;

beforeEach(() => {
  calls.length = 0;
  useDoc.setState({ roomId: 'r_00000001', doc: emptyDoc('t') });
});

describe('编辑器特效与程序化动画动作', () => {
  it('createFx 调 fx.create 并返回 fxId', async () => {
    const fxId = await useDoc.getState().createFx({ ...FACTS });
    expect(fxId).toBe('x_00000001');
    const [method, params] = calls[0] ?? [];
    expect(method).toBe('fx.create');
    expect(params).toMatchObject({ type: 'particles', rate: 20 });
  });

  it('deleteFx 调 fx.delete', async () => {
    await useDoc.getState().deleteFx('x_00000001');
    expect(calls[0]).toEqual(['fx.delete', { fxId: 'x_00000001' }, 'r_00000001']);
  });

  it('defineAnimation 调 animation.define', async () => {
    await useDoc.getState().defineAnimation('n_00000001', { type: 'float', amplitude: 0.2 });
    expect(calls[0]).toEqual([
      'animation.define',
      { nodeId: 'n_00000001', clip: { type: 'float', amplitude: 0.2 } },
      'r_00000001',
    ]);
  });

  it('clearAnimation 调 animation.clear', async () => {
    await useDoc.getState().clearAnimation('n_00000001');
    expect(calls[0]).toEqual(['animation.clear', { nodeId: 'n_00000001' }, 'r_00000001']);
  });

  it('stopAnimation 走 animation.stop op，不再调用不存在的 animation.stop 能力', async () => {
    await useDoc.getState().stopAnimation('n_00000001');
    expect(calls[0]).toEqual([
      'ops.apply',
      { ops: [{ op: 'animation.stop', target: 'n_00000001' }] },
      'r_00000001',
    ]);
  });

  it('setFog 调 env.set，null 表示清除', async () => {
    await useDoc.getState().setFog({ near: 4, far: 30, color: [1, 1, 1, 1] });
    expect(calls[0]).toEqual(['env.set', { fog: { near: 4, far: 30, color: [1, 1, 1, 1] } }, 'r_00000001']);
    calls.length = 0;
    await useDoc.getState().setFog(null);
    expect(calls[0]).toEqual(['env.set', { fog: null }, 'r_00000001']);
  });
});
