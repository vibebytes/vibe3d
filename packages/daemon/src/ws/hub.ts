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

export interface SnapshotRequest {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  at?: number;
  transparent?: boolean;
}

export interface SnapshotCapture {
  base64: string;
  mime?: string;
  width?: number;
  height?: number;
}

const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export class WsHub {
  private readonly rooms = new Map<string, Set<HubClient>>();
  private readonly waiters = new Map<
    string,
    {
      resolve: (shot: SnapshotCapture) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
      candidates: HubClient[];
      index: number;
      opts?: SnapshotRequest;
    }
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

  total(): number {
    let n = 0;
    for (const set of this.rooms.values()) n += set.size;
    return n;
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

  requestSnapshot(roomId: string, opts: SnapshotRequest = {}, timeoutMs = 5_000): Promise<SnapshotCapture> {
    const candidates = [...(this.rooms.get(roomId) ?? [])];
    if (candidates.length === 0) {
      return Promise.reject(new Error('房间没有在线 editor / headless 页面'));
    }
    const requestId = randomUUID();
    return new Promise<SnapshotCapture>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(requestId);
        reject(new Error('editor 快照超时'));
      }, timeoutMs);
      const waiter = { resolve, reject, timer, candidates, index: 0 };
      this.waiters.set(requestId, waiter);
      this.sendSnapshotRequest(requestId, waiter, opts);
    });
  }

  resolveSnapshot(
    requestId: string,
    capture?: { base64?: string; mime?: string; width?: number; height?: number },
    error?: string,
  ): void {
    const waiter = this.waiters.get(requestId);
    if (!waiter) return;
    const failure = error ?? (capture?.base64 ? undefined : 'editor 快照失败');
    if (failure) {
      waiter.index += 1;
      if (waiter.index < waiter.candidates.length) {
        this.sendSnapshotRequest(requestId, waiter, waiter.opts ?? {});
        return;
      }
    }
    this.waiters.delete(requestId);
    clearTimeout(waiter.timer);
    if (capture?.base64) waiter.resolve({ base64: capture.base64, ...capture });
    else waiter.reject(new Error(failure ?? 'editor 快照失败'));
  }

  private sendSnapshotRequest(
    requestId: string,
    waiter: { candidates: HubClient[]; index: number; opts?: SnapshotRequest },
    opts: SnapshotRequest,
  ): void {
    waiter.opts = opts;
    const target = waiter.candidates[waiter.index];
    if (!target) return;
    target.socket.send(
      encodeFrame({ type: 'event', event: 'snapshot.request', data: { requestId, ...opts } }),
    );
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
