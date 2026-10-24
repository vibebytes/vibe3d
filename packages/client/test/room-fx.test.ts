import { describe, expect, it } from 'vitest';
import { mockTransport } from '../src/mock';
import { RoomHandle } from '../src/room';

const ENV = { background: [0, 0, 0, 1], ambient: [1, 1, 1, 1], ambientIntensity: 1, fog: null };

function recorder() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const transport = mockTransport({
    dispatch: async (method, params) => {
      calls.push([method, params]);
      if (method === 'fx.create') return { revision: 2, fxId: 'x_00000001', approximate: true };
      if (method === 'fx.delete') return { revision: 3, removed: true };
      if (method === 'animation.define') return { revision: 4, nodeId: 'n_00000001' };
      if (method === 'animation.clear') return { revision: 5, cleared: true };
      if (method === 'env.set') return { revision: 6, env: ENV };
      return { revision: 1 };
    },
  });
  return { calls, room: new RoomHandle(transport, 'r_00000001') };
}

describe('SDK 特效 / 程序化动画 / 环境', () => {
  it('createFx 透传特效参数并注入 roomId', async () => {
    const { calls, room } = recorder();
    const out = await room.createFx({ type: 'particles', rate: 40, color: [1, 0.8, 0.2, 0.6] });
    expect(calls[0]?.[0]).toBe('fx.create');
    expect(calls[0]?.[1]).toMatchObject({
      roomId: 'r_00000001',
      type: 'particles',
      rate: 40,
      color: [1, 0.8, 0.2, 0.6],
    });
    expect(out.fxId).toBe('x_00000001');
  });

  it('deleteFx 命中 fx.delete', async () => {
    const { calls, room } = recorder();
    const out = await room.deleteFx('x_00000001');
    expect(calls[0]?.[0]).toBe('fx.delete');
    expect(calls[0]?.[1]).toEqual({ roomId: 'r_00000001', fxId: 'x_00000001' });
    expect(out.removed).toBe(true);
  });

  it('defineAnimation 透传轨道参数', async () => {
    const { calls, room } = recorder();
    await room.defineAnimation({
      nodeId: 'n_00000001',
      clip: { type: 'sway', channel: 'ry', amplitude: 0.3, frequency: 0.5 },
    });
    expect(calls[0]?.[0]).toBe('animation.define');
    expect(calls[0]?.[1]).toMatchObject({
      roomId: 'r_00000001',
      nodeId: 'n_00000001',
      clip: { type: 'sway', channel: 'ry', amplitude: 0.3, frequency: 0.5 },
    });
  });

  it('clearAnimation 命中 animation.clear', async () => {
    const { calls, room } = recorder();
    const out = await room.clearAnimation('n_00000001');
    expect(calls[0]?.[0]).toBe('animation.clear');
    expect(calls[0]?.[1]).toEqual({ roomId: 'r_00000001', nodeId: 'n_00000001' });
    expect(out.cleared).toBe(true);
  });

  it('setEnv 透传雾参数并返回环境快照', async () => {
    const { calls, room } = recorder();
    const out = await room.setEnv({ fog: { color: [0.5, 0.6, 0.7, 1], near: 4, far: 30 } });
    expect(calls[0]?.[0]).toBe('env.set');
    expect(calls[0]?.[1]).toMatchObject({
      roomId: 'r_00000001',
      fog: { color: [0.5, 0.6, 0.7, 1], near: 4, far: 30 },
    });
    expect(out.env).toEqual(ENV);
  });
});
