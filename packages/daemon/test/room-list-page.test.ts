import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function seed(h: Harness, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { body } = await call(h, 'room.create', { name: `房间${i}` });
    ids.push(body.result.roomId);
  }
  return ids;
}

describe('room.list 分页', () => {
  it('limit/cursor 翻页不重不漏，nextCursor 缺省表示结束', async () => {
    const h = makeHarness();
    const created = await seed(h, 5);
    const all = await call(h, 'room.list', {});
    expect(all.body.result.rooms).toHaveLength(5);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await call(h, 'room.list', cursor ? { limit: 2, cursor } : { limit: 2 });
      expect(page.body.error).toBeUndefined();
      expect(page.body.result.rooms.length).toBeLessThanOrEqual(2);
      seen.push(...page.body.result.rooms.map((r: any) => r.roomId));
      cursor = page.body.result.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...created].sort());
  });

  it('cursor 非法时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    await seed(h, 1);
    const bad = await call(h, 'room.list', { cursor: 'not-a-cursor' });
    expect(bad.body.error?.data?.code ?? bad.body.error?.code).toBe('E_INVALID_PARAMS');
  });

  it('name_prefix 过滤 + total', async () => {
    const h = makeHarness();
    await call(h, 'room.create', { name: 'demo-主场景' });
    await call(h, 'room.create', { name: 'demo-特写' });
    await call(h, 'room.create', { name: 'scratch' });

    const { body } = await call(h, 'room.list', { namePrefix: 'demo-' });
    expect(body.error).toBeUndefined();
    expect(body.result.total).toBe(2);
    expect(body.result.rooms.map((r: any) => r.name).sort()).toEqual(['demo-主场景', 'demo-特写']);
  });

  it('name_prefix 与分页组合', async () => {
    const h = makeHarness();
    for (const name of ['keep-1', 'keep-2', 'keep-3', 'other']) await call(h, 'room.create', { name });

    const p1 = await call(h, 'room.list', { namePrefix: 'keep-', limit: 2 });
    expect(p1.body.result.total).toBe(3);
    expect(p1.body.result.rooms).toHaveLength(2);
    expect(p1.body.result.nextCursor).toBeDefined();

    const p2 = await call(h, 'room.list', {
      namePrefix: 'keep-',
      limit: 2,
      cursor: p1.body.result.nextCursor,
    });
    expect(p2.body.result.rooms).toHaveLength(1);
    const names = [...p1.body.result.rooms, ...p2.body.result.rooms].map((r: any) => r.name);
    expect(new Set(names).size).toBe(3);
  });

  it('updated_before（完整 ISO 与日期两种写法）', async () => {
    const h = makeHarness();
    const created = await seed(h, 2);

    const past = await call(h, 'room.list', { updatedBefore: '2000-01-01T00:00:00.000Z' });
    expect(past.body.result.rooms).toHaveLength(0);
    expect(past.body.result.total).toBe(0);

    const now = new Date(Date.now() + 50).toISOString();
    const self = await call(h, 'room.list', { updatedBefore: now });
    expect(self.body.result.rooms.map((r: any) => r.roomId).sort()).toEqual([...created].sort());

    const futureDate = '2999-12-31';
    const all = await call(h, 'room.list', { updatedBefore: futureDate });
    expect(all.body.result.rooms).toHaveLength(2);
  });
});

describe('room.close 批量 ids（V2-11）', () => {
  it('批量关闭并 purge', async () => {
    const h = makeHarness();
    const a = await call(h, 'room.create', { name: 'batch-a' });
    const b = await call(h, 'room.create', { name: 'batch-b' });
    const idA = a.body.result.roomId;
    const idB = b.body.result.roomId;

    const { body } = await call(h, 'room.close', { ids: [idA, idB], purge: true });
    expect(body.error).toBeUndefined();
    expect(body.result.closedCount).toBe(2);
    expect(body.result.results.map((r: any) => r.roomId).sort()).toEqual([idA, idB].sort());

    for (const id of [idA, idB]) {
      const gone = await call(h, 'room.get', {}, id);
      expect(gone.body.error?.data?.code ?? gone.body.error?.code).toBe('E_ROOM_NOT_FOUND');
    }
  });

  it('all-or-nothing：任一 id 不存在则整体 E_ROOM_NOT_FOUND，不部分关闭', async () => {
    const h = makeHarness();
    const a = await call(h, 'room.create', { name: 'keep-a' });
    const idA = a.body.result.roomId;

    const { body } = await call(h, 'room.close', { ids: [idA, 'r_missing1'] });
    expect(body.error?.data?.code ?? body.error?.code).toBe('E_ROOM_NOT_FOUND');

    const alive = await call(h, 'room.get', {}, idA);
    expect(alive.body.error).toBeUndefined();
  });

  it('roomId 与 ids 二选一', async () => {
    const h = makeHarness();
    const a = await call(h, 'room.create', { name: 'both' });
    const idA = a.body.result.roomId;
    const { body } = await call(h, 'room.close', { roomId: idA, ids: [idA] });
    expect(body.error?.data?.code ?? body.error?.code).toBe('E_INVALID_PARAMS');
  });
});
