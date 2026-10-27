import WebSocket from 'ws';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class CdpError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly kind: string = method,
  ) {
    super(message);
    this.name = 'CdpError';
  }
}

type EventHandler = (params: Record<string, unknown>, sessionId?: string) => void;

export class Cdp {
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<EventHandler>>();
  isClosed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (raw) => this.onMessage(raw.toString()));
    ws.on('close', () => this.failAll(new CdpError('CDP 连接已关闭', 'close')));
    ws.on('error', (err) => this.failAll(new CdpError(String(err), 'socket')));
  }

  static connect(url: string, timeoutMs = 10_000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new CdpError(`连接 CDP 超时：${url}`, 'connect'));
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve(new Cdp(ws));
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(new CdpError(`连接 CDP 失败：${String(err)}`, 'connect'));
      });
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 30_000,
  ): Promise<T> {
    if (this.isClosed) return Promise.reject(new CdpError('CDP 连接已关闭', method));
    const id = ++this.seq;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(`CDP 调用超时：${method}`, method, 'timeout'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(event: string, handler: EventHandler): () => void {
    const set = this.handlers.get(event) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  close(): void {
    this.isClosed = true;
    this.failAll(new CdpError('CDP 连接已关闭', 'close'));
    try {
      this.ws.close();
    } catch {
      /* 已关闭 */
    }
  }

  private onMessage(raw: string): void {
    let msg: {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      sessionId?: string;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') {
      if (!msg.method) return;
      const set = this.handlers.get(msg.method);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(msg.params ?? {}, msg.sessionId);
        } catch {
          /* 监听器异常不影响主流程 */
        }
      }
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) pending.reject(new CdpError(msg.error.message ?? 'CDP 错误', String(msg.id)));
    else pending.resolve(msg.result ?? {});
  }

  private failAll(err: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(id);
    }
  }
}
