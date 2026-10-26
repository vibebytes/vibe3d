import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { type ToolResult, ToolRuntime } from '../src/tools';

function fakeStudio() {
  let seq = 0;
  const client = {
    call: async (method: string, params: Record<string, unknown>) => {
      if (method === 'room.create') {
        seq += 1;
        const roomId = `r_${String(seq).padStart(8, '0')}`;
        const name = typeof params.name === 'string' ? params.name : 'room';
        return {
          roomId,
          name,
          url: `http://127.0.0.1:1/r/${roomId}`,
          openUrl: `http://127.0.0.1:1/r/${roomId}?t=tk`,
          revision: 0,
        };
      }
      return { revision: 1 };
    },
  };
  const studio = {
    client,
    createRoom: async (input: Record<string, unknown>) => {
      const room = (await client.call('room.create', input)) as { roomId: string };
      return { id: room.roomId };
    },
    room: (roomId: string) => ({
      id: roomId,
      invoke: async (method: string) => {
        if (method === 'room.get') return { roomId, name: 'room', revision: 1, nodeCount: 0 };
        return { revision: 1 };
      },
    }),
  };
  return studio as unknown as Studio;
}

const texts = (result: ToolResult): string[] =>
  result.content
    .filter((c) => (c as { type?: string }).type === 'text')
    .map((c) => String((c as { text: string }).text));

const cardOf = (result: ToolResult): Record<string, unknown> => {
  const block = texts(result).find((t) => t.includes('<fast-artifact>'));
  expect(block).toBeTruthy();
  const body = String(block).replace(/^[\s\S]*?<fast-artifact>/, '').replace(/<\/fast-artifact>[\s\S]*$/, '');
  return JSON.parse(body) as Record<string, unknown>;
};

describe('create_room 声明一张可打开的卡片', () => {
  it('JSON 之后追加 fast-artifact，指向本房间的编辑器 surface', async () => {
    const runtime = new ToolRuntime(fakeStudio());
    const result = await runtime.call('vibe3d_create_room', { name: 'Clay mannequin fight' });

    expect(JSON.parse(texts(result)[0] as string).roomId).toBe('r_00000001');
    expect(cardOf(result)).toEqual({
      kind: 'scene',
      title: 'Clay mannequin fight',
      meta: ['r_00000001'],
      open: {
        kind: 'surface',
        extId: 'vibe3d',
        surfaceId: 'vibe3d.editor',
        url: 'http://127.0.0.1:1/r/r_00000001?t=tk',
        instanceKey: 'r_00000001',
        roomId: 'r_00000001',
      },
    });
  });

  it('其它工具不带卡：卡片只属于“创建”这个动作', async () => {
    const runtime = new ToolRuntime(fakeStudio(), 'r_00000001');
    const result = await runtime.call('vibe3d_get_scene', {});
    expect(texts(result).join('\n')).not.toContain('<fast-artifact>');
  });
});
