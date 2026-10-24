import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vibe3DError } from '../src/errors';
import { RpcClient } from '../src/transport';

const CAPS = ['scene.stats', 'render.views'];

function hangingFetch() {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    if (body.method === 'hello') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '0.1', daemonVersion: '0.1.0', renderer: 'none', capabilities: CAPS },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    }
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
}

describe('K4 分层超时', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('render.views 走 120s，scene.stats 走 30s', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const client = new RpcClient({ url: 'http://daemon.test', token: 't' });

    let slowDone = false;
    const slow = client.call('render.views', {}, { roomId: 'r_0000000a' }).then(
      (v) => {
        slowDone = true;
        return v;
      },
      (e: Vibe3DError) => {
        slowDone = true;
        return e;
      },
    );
    await vi.advanceTimersByTimeAsync(30_001);
    expect(slowDone).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    const slowErr = await slow;
    expect(slowDone).toBe(true);
    expect(slowErr).toBeInstanceOf(Vibe3DError);
    expect((slowErr as Vibe3DError).code).toBe('E_TIMEOUT');
    expect((slowErr as Vibe3DError).data).toMatchObject({ method: 'render.views', timeoutMs: 120_000 });

    let fastDone = false;
    const fast = client.call('scene.stats', {}, { roomId: 'r_0000000a' }).then(
      (v) => {
        fastDone = true;
        return v;
      },
      (e: Vibe3DError) => {
        fastDone = true;
        return e;
      },
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fastDone).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const fastErr = (await fast) as Vibe3DError;
    expect(fastErr).toBeInstanceOf(Vibe3DError);
    expect(fastErr.code).toBe('E_TIMEOUT');
    expect(fastErr.data).toMatchObject({ method: 'scene.stats', timeoutMs: 30_000 });
    expect(fastErr.message).toContain('scene.stats');
    expect(fastErr.message).toContain('30000');
  });

  it('显式 timeoutMs 优先于分层预算', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const client = new RpcClient({ url: 'http://daemon.test', token: 't' });
    const call = client.call('render.views', {}, { roomId: 'r_0000000a', timeoutMs: 5_000 }).then(
      (v) => v,
      (e: Vibe3DError) => e,
    );
    await vi.advanceTimersByTimeAsync(5_001);
    const err = (await call) as Vibe3DError;
    expect(err).toBeInstanceOf(Vibe3DError);
    expect(err.data).toMatchObject({ method: 'render.views', timeoutMs: 5_000 });
  });

  it('retryable 由协议错误表决定', () => {
    expect(new Vibe3DError('E_TIMEOUT', 'x').retryable).toBe(true);
    expect(new Vibe3DError('E_RATE_LIMITED', 'x').retryable).toBe(true);
    expect(new Vibe3DError('E_INVALID_PARAMS', 'x').retryable).toBe(false);
    expect(new Vibe3DError('E_CONFLICT', 'x').retryable).toBe(true);
  });
});
