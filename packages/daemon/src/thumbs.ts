import { createHash } from 'node:crypto';
import { resolveQuality } from '@vibebyte/vibe3d-scene';
import type { DispatchContext, Renderer } from './context';
import type { Room } from './rooms/room';

export const THUMB_WIDTH = 320;
export const THUMB_HEIGHT = 180;
export const THUMB_HASH = (() =>
  createHash('sha1')
    .update(JSON.stringify({ width: THUMB_WIDTH, height: THUMB_HEIGHT }))
    .digest('hex')
    .slice(0, 12))();

interface ThumbEntry {
  key: string;
  revision: number;
  hash: string;
  mime: string;
  bytes: Buffer;
}

export interface ThumbLatest {
  revision: number;
  hash: string;
}

export class ThumbsStore {
  private readonly store = new Map<string, ThumbEntry>();
  private readonly inflight = new Set<string>();
  private readonly pending: Array<() => void> = [];
  private active = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: {
      getRenderer: (ctx: DispatchContext) => Renderer | undefined;
      concurrency?: number;
    },
  ) {}

  latest(roomId: string): ThumbLatest | undefined {
    const e = this.store.get(roomId);
    return e ? { revision: e.revision, hash: e.hash } : undefined;
  }

  get(roomId: string, revision: number, hash: string): ThumbEntry | undefined {
    const e = this.store.get(roomId);
    if (!e || e.revision !== revision || e.hash !== hash) return undefined;
    return e;
  }

  ensure(ctx: DispatchContext, room: Room): void {
    this.enqueue(ctx, room);
  }

  async idle(): Promise<void> {
    await this.chain;
  }

  private enqueue(ctx: DispatchContext, room: Room): void {
    const renderer = this.safeRenderer(ctx);
    if (!renderer) return;
    if (renderer.available && !renderer.available(room.id)) return;
    const revision = room.revision;
    const key = `${room.id}:${revision}:${THUMB_HASH}`;
    if (this.store.get(room.id)?.key === key || this.inflight.has(key)) return;
    this.inflight.add(key);
    this.chain = this.chain
      .then(() => this.acquire())
      .then(async () => {
        try {
          const shot = await renderer.snapshot(
            { roomId: room.id, doc: room.doc },
            { width: THUMB_WIDTH, height: THUMB_HEIGHT, format: 'png', quality: resolveQuality('draft') },
          );
          const cur = this.store.get(room.id);
          if (cur && cur.revision > revision) return;
          this.store.set(room.id, {
            key,
            revision,
            hash: THUMB_HASH,
            mime: shot.mime,
            bytes: Buffer.from(shot.base64, 'base64'),
          });
        } finally {
          this.release();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.inflight.delete(key);
      });
  }

  private acquire(): Promise<void> {
    const limit = Math.max(1, this.opts.concurrency ?? 2);
    if (this.active < limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.pending.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.pending.shift()?.();
  }

  private safeRenderer(ctx: DispatchContext): Renderer | undefined {
    try {
      return this.opts.getRenderer(ctx);
    } catch {
      return undefined;
    }
  }
}

export function thumbUrl(baseUrl: string, roomId: string, thumb: ThumbLatest): string {
  return `${baseUrl}/thumbs/${roomId}/${thumb.revision}/${thumb.hash}.png`;
}
