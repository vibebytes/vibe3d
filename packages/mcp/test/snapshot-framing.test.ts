import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { ToolRuntime } from '../src/tools';

function fakeStudio() {
  const client = {
    call: async () => ({ revision: 1 }),
  };
  const studio = {
    client,
    createRoom: async () => ({ id: 'r_00000001' }),
    room: () => ({
      id: 'r_00000001',
      invoke: async (_method: string, _params: Record<string, unknown>) => ({
        revision: 1,
        mime: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        width: 1280,
        height: 720,
        quality: { level: 'standard', pixelRatio: 1, samples: 16, shadowMapSize: 1024, supersample: true },
        fog: null,
        distanceToTarget: null,
        camera: null,
        warning: null,
      }),
    }),
  };
  return { studio: studio as unknown as Studio };
}

const snapshotInput = CAPABILITIES['render.snapshot'].input;

describe('render.snapshot 取景契约（V2-01）', () => {
  it('camera 接受 doc 风格别名 p（与 position 等价），不再触发「已忽略」', () => {
    const parsed = snapshotInput.safeParse({
      roomId: 'r_00000001',
      camera: { p: [0, 1, 5], target: [0, 0, 0], fov: 35 },
    });
    expect(parsed.success).toBe(true);
  });

  it('framing 只收 camera|scene，缺省为 camera', () => {
    expect(snapshotInput.safeParse({ roomId: 'r_00000001', framing: 'scene' }).success).toBe(true);
    expect(snapshotInput.safeParse({ roomId: 'r_00000001', framing: 'camera' }).success).toBe(true);
    expect(snapshotInput.safeParse({ roomId: 'r_00000001', framing: 'bbox' }).success).toBe(false);
    const bare = snapshotInput.safeParse({ roomId: 'r_00000001' });
    expect(bare.success && bare.data.framing).toBe('camera');
  });

  it('调用 snapshot 传 camera.p 不再出现「字段已忽略」警告', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_00000001');
    const result = await runtime.call('vibe3d_render', {
      op: 'snapshot',
      roomId: 'r_00000001',
      camera: { p: [0, 1, 5], target: [0, 0, 0] },
    });
    expect(result.isError).toBeFalsy();
    const notes = result.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .filter((text) => text.includes('已忽略'));
    expect(notes).toHaveLength(0);
  });
});
