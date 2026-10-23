import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  AppError,
  type RoomId,
  type SceneDoc,
  emptyDoc,
  isRoomId,
  makeRoomId,
  sceneDocSchema,
} from '@vibebyte/vibe3d-protocol';
import { saveRoom } from '../doc/persist';
import type { Logger } from '../logger';
import { Room, type RoomOptions } from './room';

export type Template = 'empty' | 'showroom' | 'product';

export interface RoomManagerOptions {
  maxRooms: number;
  persistDir?: string;
  logger: Logger;
  onChange?: (room: Room) => void;
}

export class RoomManager {
  private rooms = new Map<RoomId, Room>();
  private readonly opts: RoomManagerOptions;

  constructor(opts: RoomManagerOptions) {
    this.opts = opts;
  }

  get size(): number {
    return this.rooms.size;
  }

  create(input: { name?: string; template?: Template } = {}): Room {
    if (this.rooms.size >= this.opts.maxRooms && !this.evictIfNeeded()) {
      throw new AppError('E_ROOM_LIMIT', `房间数已达上限 ${this.opts.maxRooms}`);
    }
    let id = makeRoomId();
    for (let i = 0; i < 3 && this.rooms.has(id); i++) id = makeRoomId();
    if (this.rooms.has(id)) throw new AppError('E_INTERNAL', 'roomId 生成冲突');

    const doc = buildTemplate(input.template ?? 'empty', input.name);
    const room = new Room(doc, id, this.roomOptions());
    this.rooms.set(id, room);
    this.persist(room);
    this.opts.logger.info({ event: 'room.create', roomId: id, template: input.template ?? 'empty' });
    return room;
  }

  get(id: string): Room {
    const room = isRoomId(id) ? this.rooms.get(id as RoomId) : undefined;
    if (!room) throw new AppError('E_ROOM_NOT_FOUND', `房间不存在：${id}`);
    return room;
  }

  list(): Room[] {
    return [...this.rooms.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  close(id: string, purge = false): void {
    const room = this.get(id);
    this.rooms.delete(room.id);
    if (purge && this.opts.persistDir) {
      const file = join(this.opts.persistDir, `${room.id}.json`);
      try {
        unlinkSync(file);
      } catch {
        /* 文件不存在即视为已清除 */
      }
    } else {
      saveRoom(this.opts.persistDir, room);
    }
    this.opts.logger.info({ event: 'room.close', roomId: room.id, purge });
  }

  load(): void {
    const dir = this.opts.persistDir;
    if (!dir) return;
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    for (const file of files) {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
          roomId?: string;
          doc?: unknown;
        };
        const doc = sceneDocSchema.parse(parsed.doc) as SceneDoc;
        if (!parsed.roomId || !isRoomId(parsed.roomId)) continue;
        const room = new Room(doc, parsed.roomId as RoomId, this.roomOptions());
        this.rooms.set(room.id, room);
      } catch (err) {
        this.opts.logger.warn({ event: 'room.load.skip', file, err: String(err) });
      }
    }
    if (files.length) this.opts.logger.info({ event: 'room.load', count: this.rooms.size });
  }

  persist(room: Room): void {
    saveRoom(this.opts.persistDir, room);
  }

  private roomOptions(): RoomOptions {
    return {
      onChange: (room) => {
        saveRoom(this.opts.persistDir, room);
        this.opts.onChange?.(room);
      },
    };
  }

  private evictIfNeeded(): boolean {
    const idle = [...this.rooms.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))[0];
    if (!idle) return false;
    this.rooms.delete(idle.id);
    this.opts.logger.info({ event: 'room.evict', roomId: idle.id });
    return true;
  }
}

const FIXTURE_DIRS = [
  'fixtures/docs',
  '../fixtures/docs',
  '../../fixtures/docs',
  '../../../fixtures/docs',
  '../../../../fixtures/docs',
];

function fixturesDir(): string | undefined {
  for (const rel of FIXTURE_DIRS) {
    const dir = join(process.cwd(), rel);
    if (existsSync(join(dir, 'showroom.json'))) return dir;
  }
  return undefined;
}

function buildTemplate(template: Template, name?: string): SceneDoc {
  if (template !== 'empty') {
    const dir = process.env.VIBE3D_FIXTURES_DIR ?? fixturesDir();
    if (dir) {
      const file = join(dir, `${template}.json`);
      if (existsSync(file)) {
        const doc = sceneDocSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        return { ...doc, revision: 0, updatedAt: new Date(0).toISOString(), ...(name ? { name } : {}) };
      }
    }
  }
  return emptyDoc(name ?? (template === 'empty' ? '未命名场景' : template));
}
