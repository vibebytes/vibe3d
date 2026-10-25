import { token } from './rpc';

const CLIENT_ID_KEY = 'vibe3d.clientId';

function readClientId(): string {
  const fresh = () => Math.random().toString(36).slice(2, 12);
  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = fresh();
    window.sessionStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return fresh();
  }
}

const CLIENT_ID = readClientId();

export interface RoomEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface RoomSocket {
  close(): void;
  send(frame: Record<string, unknown>): void;
}

export function connectRoom(
  roomId: string,
  onEvent: (evt: RoomEvent) => void,
  onState?: (open: boolean) => void,
): RoomSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  params.set('clientId', CLIENT_ID);
  if (new URLSearchParams(window.location.search).get('headless') === '1') params.set('headless', '1');
  const base = `${proto}//${window.location.host}/r/${roomId}/ws?${params.toString()}`;
  let closed = false;
  let timer: number | undefined;
  let socket: WebSocket | undefined;

  const open = () => {
    // Read the token per attempt: an embedded surface only receives it after the host handshake,
    // which can land after the first connect.
    const t = token();
    const url = t ? `${base}&t=${encodeURIComponent(t)}` : base;
    socket = new WebSocket(url);
    socket.onopen = () => onState?.(true);
    socket.onmessage = (msg) => {
      try {
        const frame = JSON.parse(String(msg.data)) as {
          type: string;
          event?: string;
          data?: Record<string, unknown>;
        };
        if (frame.type === 'ping') {
          socket?.send(JSON.stringify({ type: 'pong', t: Date.now() }));
          return;
        }
        if (frame.type === 'event' && frame.event) onEvent({ event: frame.event, data: frame.data ?? {} });
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      onState?.(false);
      if (!closed) timer = window.setTimeout(open, 1200);
    };
  };

  const onToken = () => {
    if (closed) return;
    if (timer) window.clearTimeout(timer);
    const prev = socket;
    socket = undefined;
    if (prev) {
      prev.onclose = null;
      prev.close();
    }
    open();
  };
  window.addEventListener('vibe3d:token', onToken);

  open();

  return {
    close() {
      closed = true;
      window.removeEventListener('vibe3d:token', onToken);
      if (timer) window.clearTimeout(timer);
      socket?.close();
    },
    send(frame) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
  };
}
