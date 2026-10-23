import { token } from './rpc';

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
  const url = `${proto}//${window.location.host}/r/${roomId}/ws${t ? `?t=${encodeURIComponent(t)}` : ''}`;
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
