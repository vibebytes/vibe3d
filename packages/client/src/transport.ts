import { setTimeout as delay } from 'node:timers/promises';
import { CAPABILITY_NAMES } from '@vibebyte/vibe3d-capabilities';
import { timeoutFor } from '@vibebyte/vibe3d-protocol';
import { Vibe3DError, isVibe3DError, toVibe3DError } from './errors';

const KNOWN_CAPABILITIES = new Set<string>(CAPABILITY_NAMES);

export interface RpcEndpoint {
  url: string;
  token: string;
}

export interface CallOptions {
  roomId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  protocolVersion: string;
  rooms: number;
  renderer: string;
}

export interface Transport {
  call<T = unknown>(method: string, params?: Record<string, unknown>, opts?: CallOptions): Promise<T>;
  uploadAsset(roomId: string, bytes: Uint8Array | Blob, name: string): Promise<unknown>;
  health(): Promise<HealthInfo>;
}

interface Envelope {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface Reply {
  jsonrpc?: '2.0';
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: Record<string, unknown> };
}

export class RpcClient implements Transport {
  readonly url: string;
  readonly token: string;
  private seq = 0;
  private caps: Promise<{ version: string; capabilities: string[] }> | undefined;

  constructor(ep: RpcEndpoint) {
    this.url = ep.url.replace(/\/$/, '');
    this.token = ep.token;
  }

  endpoint(roomId: string): string {
    return `${this.url}/r/${roomId}/rpc`;
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    opts: CallOptions = {},
  ): Promise<T> {
    const target = opts.roomId ? this.endpoint(opts.roomId) : `${this.url}/rpc`;
    await this.ensureCapable(method);
    const retries = opts.retries ?? 0;
    let attempt = 0;
    for (;;) {
      try {
        return await this.once<T>(target, { jsonrpc: '2.0', id: ++this.seq, method, params }, opts);
      } catch (err) {
        const retryable = isVibe3DError(err) && err.retryable;
        if (!retryable || attempt >= retries) throw err;
        await delay(Math.min(1000, 100 * 2 ** attempt));
        attempt += 1;
      }
    }
  }

  private async ensureCapable(method: string): Promise<void> {
    if (method === 'hello' || !KNOWN_CAPABILITIES.has(method)) return;
    const caps = await this.serverCaps();
    if (caps.capabilities.includes(method)) return;
    throw new Vibe3DError(
      'E_DAEMON_OUTDATED',
      `daemon ${caps.version} 不认识方法 ${method}：正在跑的是旧版本进程（客户端有 ${KNOWN_CAPABILITIES.size} 项能力）。重启 daemon 后再试；重启会丢失未持久化的房间，先用 scene export 备份。`,
    );
  }

  private serverCaps(): Promise<{ version: string; capabilities: string[] }> {
    if (!this.caps) {
      this.caps = this.once<{ daemonVersion?: string; capabilities?: string[] }>(
        `${this.url}/rpc`,
        { jsonrpc: '2.0', id: ++this.seq, method: 'hello', params: {} },
        { timeoutMs: 10_000 },
      )
        .then((hello) => ({
          version: hello.daemonVersion ?? 'unknown',
          capabilities: hello.capabilities ?? [],
        }))
        .catch((err: unknown) => {
          this.caps = undefined;
          throw err;
        });
    }
    return this.caps;
  }

  private async once<T>(target: string, body: Envelope, opts: CallOptions): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? timeoutFor(body.method);
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const onAbort = () => controller.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    let res: Response;
    try {
      res = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted && opts.signal?.aborted) {
        throw new Vibe3DError('E_NETWORK', '请求已取消', { cause: String(err) });
      }
      if (controller.signal.aborted)
        throw new Vibe3DError('E_TIMEOUT', `请求超时：${body.method}（${timeoutMs}ms）`, {
          method: body.method,
          timeoutMs,
        });
      throw new Vibe3DError('E_NETWORK', `无法连接 daemon：${this.url}`, { cause: String(err) });
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (!res.ok && res.status === 401) {
      throw new Vibe3DError('E_UNAUTHORIZED', 'daemon token 无效', undefined, 401);
    }
    const payload = (await res.json().catch(() => null)) as Reply | null;
    if (!payload)
      throw new Vibe3DError(
        'E_HTTP',
        `daemon 返回了非 JSON 响应（HTTP ${res.status}）`,
        undefined,
        res.status,
      );
    if (payload.error) {
      const info = payload.error.data ?? {};
      const code = typeof info.code === 'string' ? info.code : 'E_INTERNAL';
      const message = typeof info.message === 'string' ? info.message : (payload.error.message ?? '未知错误');
      const detail = Object.fromEntries(
        Object.entries(info).filter(([k]) => k !== 'code' && k !== 'retryable' && k !== 'message'),
      );
      const data = Object.keys(detail).length > 0 ? detail : undefined;
      throw toVibe3DError(code, message, data, res.status);
    }
    return payload.result as T;
  }

  async uploadAsset(roomId: string, bytes: Uint8Array | Blob, name: string): Promise<unknown> {
    const form = new FormData();
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'model/gltf-binary' });
    form.set('file', blob, name);
    const res = await fetch(`${this.url}/r/${roomId}/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
    });
    const payload = (await res.json().catch(() => null)) as {
      error?: { data?: { code?: string; message?: string } };
    } | null;
    if (!res.ok) {
      const code = payload?.error?.data?.code ?? 'E_HTTP';
      throw toVibe3DError(
        code,
        payload?.error?.data?.message ?? `上传失败（HTTP ${res.status}）`,
        undefined,
        res.status,
      );
    }
    return payload;
  }

  async health(): Promise<HealthInfo> {
    const res = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Vibe3DError('E_HTTP', `health 返回 HTTP ${res.status}`, undefined, res.status);
    return (await res.json()) as HealthInfo;
  }
}
