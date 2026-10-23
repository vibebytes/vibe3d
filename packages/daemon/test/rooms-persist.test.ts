import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyDoc, makeRoomId } from '@vibebyte/vibe3d-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushAll, flushRoom, saveRoom } from '../src/doc/persist';
import { createLogger } from '../src/logger';
import { RoomManager } from '../src/rooms/manager';
import { silentLogger } from './helpers/harness';

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe('RoomManager', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, 'VIBE3D_FIXTURES_DIR');
  });

  it('创建/查询/列表与默认命名', () => {
    const rooms = new RoomManager({ maxRooms: 4, logger: silentLogger() });
    const a = rooms.create();
    expect(a.doc.name).toBe('未命名场景');
    const b = rooms.create({ name: '自定义' });
    expect(b.doc.name).toBe('自定义');
    expect(rooms.size).toBe(2);
    expect(rooms.get(a.id).id).toBe(a.id);
    expect(rooms.list().map((r) => r.id)).toContain(b.id);
    expect(() => rooms.get('bad-id')).toThrow(/房间不存在/);
    expect(() => rooms.get(`${makeRoomId()}x`)).toThrow(/房间不存在/);
  });

  it('模板从 VIBE3D_FIXTURES_DIR 读取，缺失时回落空文档', () => {
    const dir = tmp('v3d-fix-');
    writeFileSync(join(dir, 'showroom.json'), JSON.stringify(emptyDoc('fixture')));
    process.env.VIBE3D_FIXTURES_DIR = dir;
    const rooms = new RoomManager({ maxRooms: 4, logger: silentLogger() });
    const showroom = rooms.create({ template: 'showroom', name: '展厅' });
    expect(showroom.doc.name).toBe('展厅');
    expect(showroom.doc.nodes).toEqual({});
    const product = rooms.create({ template: 'product' });
    expect(product.doc.name).toBe('product');
  });

  it('房间数满时淘汰最旧，maxRooms=0 时报 E_ROOM_LIMIT', () => {
    process.env.VIBE3D_FIXTURES_DIR = tmp('v3d-none-');
    const rooms = new RoomManager({ maxRooms: 1, logger: silentLogger() });
    const first = rooms.create({ name: 'a' });
    const second = rooms.create({ name: 'b' });
    expect(rooms.size).toBe(1);
    expect(() => rooms.get(first.id)).toThrow(/房间不存在/);
    expect(rooms.get(second.id).doc.name).toBe('b');

    const none = new RoomManager({ maxRooms: 0, logger: silentLogger() });
    expect(() => none.create()).toThrow(/上限 0/);
  });

  it('关闭房间：purge 删除档案，非 purge 保留并重新落盘', () => {
    const dir = tmp('v3d-rooms-');
    const rooms = new RoomManager({ maxRooms: 4, persistDir: dir, logger: silentLogger() });
    const a = rooms.create({ name: 'a' });
    flushRoom(dir, a);
    expect(existsSync(join(dir, `${a.id}.json`))).toBe(true);
    rooms.close(a.id, true);
    expect(existsSync(join(dir, `${a.id}.json`))).toBe(false);

    const b = rooms.create({ name: 'b' });
    rooms.close(b.id, false);
    flushRoom(dir, b);
    expect(existsSync(join(dir, `${b.id}.json`))).toBe(true);
  });

  it('load 跳过坏文件与非法 roomId', () => {
    const dir = tmp('v3d-load-');
    const log = vi.fn();
    const logger = { ...silentLogger(), warn: log };
    const source = new RoomManager({ maxRooms: 4, logger: silentLogger() });
    const room = source.create({ name: '持久化' });
    mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify({ roomId: room.id, doc: room.doc });
    writeFileSync(join(dir, `${room.id}.json`), payload);
    writeFileSync(join(dir, 'broken.json'), '{not json');
    writeFileSync(join(dir, 'badid.json'), JSON.stringify({ roomId: 'nope', doc: room.doc }));

    const target = new RoomManager({ maxRooms: 4, persistDir: dir, logger });
    target.load();
    expect(target.size).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(target.get(room.id).doc.name).toBe('持久化');

    const noDir = new RoomManager({ maxRooms: 4, logger: silentLogger() });
    noDir.load();
    expect(noDir.size).toBe(0);
    const missingDir = new RoomManager({ maxRooms: 4, persistDir: join(dir, 'missing'), logger });
    missingDir.load();
    expect(missingDir.size).toBe(0);
  });
});

describe('persist', () => {
  it('saveRoom 防抖，flushRoom/flushAll 立即落盘', async () => {
    const dir = tmp('v3d-persist-');
    const rooms = new RoomManager({ maxRooms: 4, logger: silentLogger() });
    const a = rooms.create({ name: 'a' });
    const b = rooms.create({ name: 'b' });
    saveRoom(dir, a);
    expect(existsSync(join(dir, `${a.id}.json`))).toBe(false);
    await new Promise((r) => setTimeout(r, 1150));
    expect(JSON.parse(readFileSync(join(dir, `${a.id}.json`), 'utf8')).roomId).toBe(a.id);

    flushRoom(dir, b);
    expect(existsSync(join(dir, `${b.id}.json`))).toBe(true);
    flushAll(dir, [a, b]);
    saveRoom(undefined, a);
    flushRoom(undefined, a);
    flushAll(undefined, [a]);
  });
});

describe('logger', () => {
  it('级别过滤、child 合并与 stderr/stdout 分流', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = createLogger('warn', { app: 'daemon' });
    log.debug({ a: 1 });
    log.info({ a: 1 });
    log.warn({ event: 'w' });
    log.error({ event: 'e' }, 'boom');
    log.child({ room: 'r_1' }).warn({ event: 'child' });

    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(3);
    const lines = err.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines[0]).toMatchObject({ level: 'warn', app: 'daemon', event: 'w' });
    expect(lines[1]).toMatchObject({ level: 'error', msg: 'boom' });
    expect(lines[2]).toMatchObject({ room: 'r_1', event: 'child' });

    const info = createLogger('debug');
    info.info({ x: 1 });
    expect(out).toHaveBeenCalledTimes(1);
    out.mockRestore();
    err.mockRestore();
  });
});
