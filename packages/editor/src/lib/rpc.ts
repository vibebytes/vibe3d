const DAEMON = import.meta.env.VITE_DAEMON_URL ?? '';
const TOKEN_KEY = 'vibe3d.token';

/** Sandboxed iframes (`allow-scripts` only) throw on any `localStorage` access. */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let memoryToken = '';

export function captureToken(): string {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('t');
  if (fromQuery) {
    memoryToken = fromQuery;
    store()?.setItem(TOKEN_KEY, fromQuery);
    url.searchParams.delete('t');
    window.history.replaceState({}, '', url.toString());
    return fromQuery;
  }
  return token();
}

export function token(): string {
  return memoryToken || store()?.getItem(TOKEN_KEY) || '';
}

export function setToken(next: string): void {
  memoryToken = next;
  store()?.setItem(TOKEN_KEY, next);
}

export class RpcError extends Error {
  constructor(
    readonly code: string | number,
    message: string,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  result?: T;
  error?: { code: string | number; message: string; data?: unknown };
}

export async function rpc<T>(
  method: string,
  params: Record<string, unknown> = {},
  roomId?: string,
): Promise<T> {
  const res = await fetch(`${DAEMON}${roomId ? `/r/${roomId}/rpc` : '/rpc'}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token() ? { authorization: `Bearer ${token()}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method,
      params,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.error) {
    throw new RpcError(body.error?.code ?? res.status, body.error?.message ?? `HTTP ${res.status}`);
  }
  return body.result as T;
}

export function assetUrl(sha: string): string {
  return `${DAEMON}/assets/${sha}`;
}

export function daemonUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${DAEMON}${path}`;
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  protocolVersion: string;
  rooms: number;
  renderer: string;
}

export async function health(): Promise<HealthInfo> {
  const res = await fetch(`${DAEMON}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HealthInfo;
}
