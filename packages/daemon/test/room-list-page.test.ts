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
});
