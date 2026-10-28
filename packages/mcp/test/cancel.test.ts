import { type Studio, Vibe3DError } from '@vibebyte/vibe3d-client';
import { describe, expect, it, vi } from 'vitest';
import { ToolRuntime } from '../src/tools';
import { connectClient } from './helpers/client';

describe('取消', () => {
  it('客户端取消会触发传给 runtime 的 AbortSignal', async () => {
    let seen: AbortSignal | undefined;
    const { client } = await connectClient({
      runtime: async () =>
        ({
          call: async (_name: string, _args: unknown, opts?: { signal?: AbortSignal }) => {
            seen = opts?.signal;
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 2000);
              opts?.signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              });
            });
            return { content: [{ type: 'text', text: seen?.aborted ? 'cancelled' : 'done' }] };
          },
        }) as never,
    });
    const ac = new AbortController();
    const pending = client.callTool({ name: 'vibe3d_status', arguments: {} }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 30);
    await pending.catch(() => undefined);
    expect(seen?.aborted).toBe(true);
  });

  it('已取消的信号会传到 daemon 调用', async () => {
    let seen: AbortSignal | undefined;
    const studio = {
      home: '/tmp/vibe3d-cancel',
      client: {
        call: async (_method: string, _params: unknown, opts?: { signal?: AbortSignal }) => {
          seen = opts?.signal;
          return { ok: true };
        },
      },
    } as unknown as Studio;
    const runtime = new ToolRuntime(studio);
    const parent = new AbortController();
    parent.abort();
    await runtime.call('vibe3d_status', {}, { signal: parent.signal });
    expect(seen?.aborted).toBe(true);
  });

  it('取消不会重置连接，也不会把同一次调用再打一遍', async () => {
    const built = vi.fn();
    const reset = vi.fn();
    const { client } = await connectClient({
      runtime: async () => {
        built();
        return {
          call: (_name: string, _args: unknown, opts?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener('abort', () => {
                reject(new Vibe3DError('E_NETWORK', '请求已取消'));
              });
            }),
        } as never;
      },
      onRuntimeError: reset,
    });
    const ac = new AbortController();
    const pending = client.callTool({ name: 'vibe3d_status', arguments: {} }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await pending.catch(() => undefined);
    expect(built).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
