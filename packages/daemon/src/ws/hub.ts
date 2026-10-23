import { randomUUID } from 'node:crypto';
import { type ServerFrame, encodeFrame } from './protocol';

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  bufferedAmount?: number;
}

export interface HubClient {
  socket: SocketLike;
  roomId: string;
}

const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export class WsHub {
  private readonly rooms = new Map<string, Set<HubClient>>();
  private readonly waiters = new Map<
    string,
    { resolve: (png: string) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  add(roomId: string, socket: SocketLike): HubClient {
    const client: HubClient = { socket, roomId };
    let set = this.rooms.get(roomId);
    if (!set) {
      set = new Set();
      this.rooms.set(roomId, set);
    }
    set.add(client);
    this.presence(roomId);
    return client;
  }

  remove(client: HubClient): void {
    const set = this.rooms.get(client.roomId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.rooms.delete(client.roomId);
    else this.presence(client.roomId);
  }

  count(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  broadcast(roomId: string, frame: ServerFrame): void {
    const set = this.rooms.get(roomId);
    if (!set) return;
    const text = encodeFrame(frame);
    for (const client of set) {
      if ((client.socket.bufferedAmount ?? 0) > MAX_BUFFER_BYTES) {
        this.overflow(client, frame);
        continue;
      }
      client.socket.send(text);
    }
  }

  event(
    roomId: string,
    event: Extract<ServerFrame, { type: 'event' }>['event'],
    data: Record<string, unknown>,
  ): void {
    this.broadcast(roomId, { type: 'event', event, data });
  }

  requestSnapshot(roomId: string, timeoutMs = 5_000): Promise<string> {
    if (this.count(roomId) === 0) {
      return Promise.reject(new Error('房间没有在线 editor 页面'));
    }
    const requestId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(requestId);
        reject(new Error('editor 快照超时'));
      }, timeoutMs);
      this.waiters.set(requestId, { resolve, reject, timer });
      this.event(roomId, 'snapshot.request', { requestId });
    });
  }

  resolveSnapshot(requestId: string, png?: string, error?: string): void {
    const waiter = this.waiters.get(requestId);
    if (!waiter) return;
    this.waiters.delete(requestId);
    clearTimeout(waiter.timer);
    if (png) waiter.resolve(png);
    else waiter.reject(new Error(error ?? 'editor 快照失败'));
  }

  private overflow(client: HubClient, frame: ServerFrame): void {
    const revision = frame.type === 'event' ? Number(frame.data.revision ?? 0) : 0;
    try {
      client.socket.send(encodeFrame({ type: 'overflow', revision }));
    } finally {
      client.socket.close(1013, 'slow consumer');
      this.remove(client);
    }
  }

  private presence(roomId: string): void {
    this.event(roomId, 'surface.presence', { editors: this.count(roomId) });
  }
}
