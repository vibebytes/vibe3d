import { describe, expect, it } from 'vitest';
import { mockTransport } from '../src/mock';
import { RoomHandle } from '../src/room';

function recorder() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const transport = mockTransport({
    dispatch: async (method, params) => {
      calls.push([method, params]);
      return { revision: 1, camera: {}, cameras: {} };
    },
  });
  return { calls, room: new RoomHandle(transport, 'r_00000001') };
}

describe('SDK 机位', () => {
  it('saveCamera 把名字带过去', async () => {
    const { calls, room } = recorder();
    await room.saveCamera({ name: 'hero' });
    expect(calls[0]?.[0]).toBe('camera.save');
    expect(calls[0]?.[1]).toMatchObject({ name: 'hero' });
  });

  it('deleteCamera 走 camera.delete', async () => {
    const { calls, room } = recorder();
    await room.deleteCamera('hero');
    expect(calls[0]?.[0]).toBe('camera.delete');
    expect(calls[0]?.[1]).toMatchObject({ name: 'hero' });
  });

  it('setCamera 透传 name 与 preset', async () => {
    const { calls, room } = recorder();
    await room.setCamera({ preset: 'miniature_45' });
    expect(calls[0]?.[1]).toMatchObject({ preset: 'miniature_45' });
    await room.setCamera({ name: 'hero' });
    expect(calls[1]?.[1]).toMatchObject({ name: 'hero' });
  });

  it('未指定的字段不塞进请求', async () => {
    const { calls, room } = recorder();
    await room.setCamera({});
    expect(calls[0]?.[1] && 'preset' in calls[0][1]).toBe(false);
  });
});
