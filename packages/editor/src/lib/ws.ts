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
  const t = token();
  const params = new URLSearchParams();
  if (t) params.set('t', t);
  params.set('clientId', CLIENT_ID);
  if (new URLSearchParams(window.location.search).get('headless') === '1') params.set('headless', '1');
  const url = `${proto}//${window.location.host}/r/${roomId}/ws?${params.toString()}`;
  let closed = false;
  let timer: number | undefined;
  let socket: WebSocket | undefined;

  const open = () => {
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

  open();

  return {
    close() {
      closed = true;
      if (timer) window.clearTimeout(timer);
      socket?.close();
    },
    send(frame) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
  };
}
