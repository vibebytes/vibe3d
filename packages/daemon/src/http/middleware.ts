import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '@vibebyte/vibe3d-protocol';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

export const TOKEN_COOKIE = 'vibe3d_token';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
    c.set('requestId', id);
    c.header('x-request-id', id);
    await next();
  };
}

export function hostGuard(): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host');
    if (host) {
      const name = host.replace(/:\d+$/, '').toLowerCase();
      if (!ALLOWED_HOSTS.has(name)) {
        throw new AppError('E_UNAUTHORIZED', `拒绝非本机 Host：${host}`);
      }
    }
    await next();
  };
}

export function bodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const raw = c.req.header('content-length');
    if (raw && Number(raw) > maxBytes) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', `请求体超过 ${maxBytes} 字节`);
    }
    await next();
  };
}

export function tokenMatches(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerOf(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? value : undefined;
}

export function requireBearer(expected: string): MiddlewareHandler {
  return async (c, next) => {
    if (!tokenMatches(expected, bearerOf(c.req.header('authorization')))) {
      c.header('www-authenticate', 'Bearer realm="vibe3d"');
      throw new AppError('E_UNAUTHORIZED', '缺少或错误的 Bearer token');
    }
    await next();
  };
}

export function requireSurfaceToken(
  expected: string,
  opts: { allowQuery?: boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    const cookie = getCookie(c, TOKEN_COOKIE);
    const query = opts.allowQuery ? c.req.query('t') : undefined;
    if (!tokenMatches(expected, cookie) && !tokenMatches(expected, query)) {
      throw new AppError('E_UNAUTHORIZED', '缺少或错误的访问 token');
    }
    await next();
  };
}
