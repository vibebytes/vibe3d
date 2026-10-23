import { AppError } from '@vibebyte/vibe3d-protocol';
import type { MiddlewareHandler } from 'hono';
import { toRpcFailure } from './errors';

export type TakeResult = { ok: true } | { ok: false; retryAfterMs: number };

export class TokenBucket {
  #tokens: number;
  #last: number;

  constructor(
    private readonly rate: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.#tokens = burst;
    this.#last = now();
  }

  take(): TakeResult {
    if (this.rate <= 0) return { ok: true };
    const at = this.now();
    const gained = ((at - this.#last) / 1000) * this.rate;
    this.#tokens = Math.min(this.burst, this.#tokens + Math.max(0, gained));
    this.#last = at;
    if (this.#tokens >= 1) {
      this.#tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil(((1 - this.#tokens) / this.rate) * 1000) };
  }
}

export interface RateLimitOptions {
  rate: number;
  burst: number;
  now?: () => number;
}

export function rateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const bucket = new TokenBucket(opts.rate, opts.burst, opts.now);
  return async (c, next) => {
    const result = bucket.take();
    if (!result.ok) {
      const failure = toRpcFailure(
        new AppError('E_RATE_LIMITED', undefined, { retryAfterMs: result.retryAfterMs }),
      );
      c.header('retry-after', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
      return c.json({ jsonrpc: '2.0', id: null, error: failure.body }, 429);
    }
    await next();
  };
}
