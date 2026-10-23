import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { TokenBucket, rateLimiter } from '../src/http/ratelimit';

describe('TokenBucket', () => {
  it('allows burst then denies with retry hint', () => {
    const bucket = new TokenBucket(1, 2, () => 0);
    expect(bucket.take().ok).toBe(true);
    expect(bucket.take().ok).toBe(true);
    const denied = bucket.take();
    expect(denied.ok).toBe(false);
    expect(denied.ok === false && denied.retryAfterMs).toBe(1000);
  });

  it('refills at the configured rate', () => {
    let now = 0;
    const bucket = new TokenBucket(1, 1, () => now);
    expect(bucket.take().ok).toBe(true);
    now = 999;
    expect(bucket.take().ok).toBe(false);
    now = 1000;
    expect(bucket.take().ok).toBe(true);
  });

  it('rate 0 disables limiting', () => {
    const bucket = new TokenBucket(0, 0, () => 0);
    for (let i = 0; i < 100; i++) expect(bucket.take().ok).toBe(true);
  });
});

describe('rateLimiter middleware', () => {
  const appWith = (rate: number, burst: number) => {
    const app = new Hono();
    app.use('/rpc', rateLimiter({ rate, burst }));
    app.post('/rpc', (c) => c.json({ ok: true }));
    return app;
  };

  it('returns 429 with JSON-RPC error and Retry-After', async () => {
    const app = appWith(1, 2);
    expect((await app.request('/rpc', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/rpc', { method: 'POST' })).status).toBe(200);
    const limited = await app.request('/rpc', { method: 'POST' });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = (await limited.json()) as {
      error: { code: number; data: { code: string; retryable: boolean } };
    };
    expect(body.error.code).toBe(-32014);
    expect(body.error.data.code).toBe('E_RATE_LIMITED');
    expect(body.error.data.retryable).toBe(true);
  });

  it('does not limit non-rpc paths', async () => {
    const app = new Hono();
    app.use('/rpc', rateLimiter({ rate: 1, burst: 1 }));
    app.get('/health', (c) => c.json({ ok: true }));
    for (let i = 0; i < 10; i++) expect((await app.request('/health')).status).toBe(200);
  });
});
