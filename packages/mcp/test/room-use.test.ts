import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { type ToolResult, ToolRuntime } from '../src/tools';

interface Call {
  method: string;
  roomId?: string;
  params: Record<string, unknown>;
}

function fakeStudio() {
  const calls: Call[] = [];
  const client = {
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'room.create') {
        return { roomId: 'r_0000000a', name: 'x', url: 'http://127.0.0.1:1', revision: 0 };
      }
      return { revision: 1 };
    },
  };
  const studio = {
    client,
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: (roomId: string) => ({
      id: roomId,
      invoke: async (method: string, params: Record<string, unknown>) => {
        calls.push({ method, roomId, params });
        return { roomId, name: 'x', revision: 3, nodes: 1 };
      },
    }),
  };
  return { studio: studio as unknown as Studio, calls };
}

const jsonOf = (result: ToolResult): Record<string, unknown> => {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as Record<string, unknown>;
};

describe('vibe3d_use_room：只切绑定，不弹窗', () => {
  it('绑定后 room 级工具直接落到该房间且不调用 editor.open', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    expect(runtime.session.current).toBeUndefined();

    const used = await runtime.call('vibe3d_use_room', { roomId: 'r_0000000d' });
    expect(used.isError).toBeFalsy();
    expect(jsonOf(used).roomId).toBe('r_0000000d');
    expect(runtime.session.current).toBe('r_0000000d');

    const undone = await runtime.call('vibe3d_undo', {});
    expect(undone.isError).toBeFalsy();
    expect(calls.some((c) => c.method === 'editor.open')).toBe(false);
    expect(calls[calls.length - 1]).toMatchObject({ method: 'scene.undo', roomId: 'r_0000000d' });
  });

  it('room.use 的输入是连接层参数，不作为普通 room 级工具暴露', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    const missing = await runtime.call('vibe3d_use_room', { roomId: 'nope' });
    expect(missing.isError).toBe(true);
    expect(String(jsonOf(missing).code ?? '')).toBe('E_INVALID_PARAMS');
  });

  it('不传 room_id 时明确报错，而不是静默切到当前房间', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_use_room', { roomId: 'r_0000000d' });
    const before = calls.length;
    const missing = await runtime.call('vibe3d_use_room', {});
    expect(missing.isError).toBe(true);
    expect(String(jsonOf(missing).code ?? '')).toBe('E_INVALID_PARAMS');
    expect(calls.length).toBe(before);
  });
});
