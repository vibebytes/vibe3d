import { AppError } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { isVibe3DError } from '../src/errors';
import { mockTransport } from '../src/mock';
import { RoomHandle } from '../src/room';

describe('mockTransport', () => {
  it('把 dispatch 的返回值透传给调用方', async () => {
    const t = mockTransport({ dispatch: async (method, params) => ({ method, params }) });
    await expect(t.call('scene.get', { roomId: 'r1' })).resolves.toEqual({
      method: 'scene.get',
      params: { roomId: 'r1' },
    });
  });

  it('把 AppError 翻译成同码的 Vibe3DError，并带上 http 状态', async () => {
    const t = mockTransport({
      dispatch: async () => {
        throw new AppError('E_ASSET_TYPE', '伪装扩展名', { allowed: ['.glb'] });
      },
    });
    let caught: unknown;
    try {
      await t.call('node.import');
    } catch (err) {
      caught = err;
    }
    expect(isVibe3DError(caught)).toBe(true);
    if (!isVibe3DError(caught)) return;
    expect(caught.code).toBe('E_ASSET_TYPE');
    expect(caught.message).toBe('伪装扩展名');
    expect(caught.data).toEqual({ allowed: ['.glb'] });
    expect(caught.status).toBe(415);
    expect(caught.retryable).toBe(false);
  });

  it('未注入 uploadAsset / health 时给出 E_NETWORK，而不是静默成功', async () => {
    const t = mockTransport({ dispatch: async () => ({}) });
    await expect(t.uploadAsset('r1', new Uint8Array([1]), 'a.glb')).rejects.toMatchObject({
      code: 'E_NETWORK',
    });
    await expect(t.health()).rejects.toMatchObject({ code: 'E_NETWORK' });
  });

  it('注入后透传 uploadAsset 与 health', async () => {
    const seen: unknown[] = [];
    const t = mockTransport({
      dispatch: async () => ({}),
      uploadAsset: async (roomId, bytes, name) => {
        seen.push(roomId, name, bytes);
        return { sha: 'abc' };
      },
      health: async () => ({
        ok: true,
        version: '0.1.0',
        protocolVersion: '1',
        rooms: 0,
        renderer: 'auto',
      }),
    });
    await expect(t.uploadAsset('r1', new Uint8Array([1]), 'a.glb')).resolves.toEqual({ sha: 'abc' });
    expect(seen).toEqual(['r1', 'a.glb', new Uint8Array([1])]);
    await expect(t.health()).resolves.toMatchObject({ ok: true, renderer: 'auto' });
  });

  it('RoomHandle 经 mock transport 调用时会自动补 roomId', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const handle = new RoomHandle(
      mockTransport({
        dispatch: async (method, params) => {
          calls.push([method, params]);
          return { nodeId: 'n1' };
        },
      }),
      'room-7',
    );
    await handle.createNode({ type: 'group', name: '组' } as never);
    expect(calls).toEqual([['node.create', { type: 'group', name: '组', roomId: 'room-7' }]]);
  });
});
