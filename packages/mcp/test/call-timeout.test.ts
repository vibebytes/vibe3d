import type { Studio } from '@vibebyte/vibe3d-client';
import { afterEach, describe, expect, it } from 'vitest';
import { type ToolResult, ToolRuntime } from '../src/tools';

const jsonOf = (result: ToolResult): Record<string, unknown> => {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as Record<string, unknown>;
};

const hangingStudio = () => {
  const studio = {
    client: { call: async () => ({}) },
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: (roomId: string) => ({
      id: roomId,
      invoke: (method: string) =>
        method === 'room.use' ? Promise.resolve({ roomId }) : new Promise(() => {}),
    }),
  };
  return studio as unknown as Studio;
};

const bind = async () => {
  const runtime = new ToolRuntime(hangingStudio());
  const used = await runtime.call('vibe3d_use_room', { roomId: 'r_0000000a' });
  expect(used.isError).toBeFalsy();
  return runtime;
};

describe('call deadline', () => {
  afterEach(() => {
    delete process.env.VIBE3D_CALL_TIMEOUT_MS;
  });

  it('returns E_TIMEOUT instead of hanging the host', async () => {
    process.env.VIBE3D_CALL_TIMEOUT_MS = '30';
    const runtime = await bind();
    const started = Date.now();
    const result = await runtime.call('vibe3d_node', { op: 'get', nodeId: 'n_0000000a' });
    const elapsed = Date.now() - started;
    expect(result.isError).toBe(true);
    expect(elapsed).toBeLessThan(1000);
    const body = jsonOf(result);
    expect(body.code).toBe('E_TIMEOUT');
    expect(String(body.message)).toContain('超时');
  });

  it('tells the caller how to probe the daemon', async () => {
    process.env.VIBE3D_CALL_TIMEOUT_MS = '20';
    const runtime = await bind();
    const body = jsonOf(await runtime.call('vibe3d_node', { op: 'get', nodeId: 'n_0000000a' }));
    expect(`${body.hint ?? ''}${body.message}`).toMatch(/vibe3d_status|重试/);
  });

  it('reports the budget, the elapsed time and the params it gave up on', async () => {
    process.env.VIBE3D_CALL_TIMEOUT_MS = '20';
    const runtime = await bind();
    const body = jsonOf(await runtime.call('vibe3d_node', { op: 'get', nodeId: 'n_0000000a' }));
    expect(body.timeoutMs).toBe(20);
    expect(Number(body.elapsedMs)).toBeGreaterThanOrEqual(15);
    expect(body.params).toMatchObject({ nodeId: 'n_0000000a' });
  });

  it('suggests halving the resolution when a snapshot times out', async () => {
    process.env.VIBE3D_CALL_TIMEOUT_MS = '20';
    const runtime = await bind();
    const body = jsonOf(await runtime.call('vibe3d_render_snapshot', { width: 1600, height: 900 }));
    expect(body.code).toBe('E_TIMEOUT');
    const next = body.next as Array<{ tool: string; params?: Record<string, unknown> }>;
    expect(next[0]?.tool).toBe('vibe3d_render_snapshot');
    expect(next[0]?.params).toMatchObject({ width: 800, height: 450 });
  });
});
