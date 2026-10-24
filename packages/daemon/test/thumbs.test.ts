import { describe, expect, it } from 'vitest';
import type { Renderer } from '../src/context';
import { ThumbsStore } from '../src/thumbs';
import { call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function fakeRenderer(): Renderer & { calls: number } {
  const impl = {
    calls: 0,
    name: 'fake',
    ready: true,
    snapshot: async ({ roomId }: { roomId: string }, opts: { width?: number }) => {
      impl.calls += 1;
      return {
        mime: 'image/png',
        base64: Buffer.from(`thumb:${roomId}:${opts.width ?? 0}`).toString('base64'),
        width: opts.width ?? 320,
        height: 180,
      };
    },
  };
  return impl as unknown as Renderer & { calls: number };
}

async function makeRoomWithThumbs() {
  const h = makeHarness();
  const renderer = fakeRenderer();
  h.ctx.thumbs = new ThumbsStore({ getRenderer: () => renderer });
  const room = await call(h, 'room.create', { name: 'thumb-demo' });
  const roomId = room.body.result.roomId as string;
  return { h, renderer, roomId };
}

describe('thumbs: 无 renderer 静默降级', () => {
  it('room.get 不带 thumbUrl 也不报错', async () => {
    const h = makeHarness();
    const room = await call(h, 'room.create', { name: 'no-renderer' });
    const roomId = room.body.result.roomId as string;
    const got = await call(h, 'room.get', { roomId });
    expect(got.status).toBe(200);
    expect(got.body.result.thumbUrl).toBeUndefined();
  });
});

describe('thumbs: 读路径触发生成并回 thumbUrl', () => {
  it('room.get 触发生成，完成后带 thumbUrl 且 hash 稳定', async () => {
    const { h, renderer, roomId } = await makeRoomWithThumbs();
    const first = await call(h, 'room.get', { roomId });
    expect(first.status).toBe(200);
    await h.ctx.thumbs!.idle();
    expect(renderer.calls).toBe(1);
    const second = await call(h, 'room.get', { roomId });
    const url = second.body.result.thumbUrl as string;
    expect(url).toMatch(new RegExp(`/thumbs/${roomId}/1/[0-9a-f]{12}\\.png$`));
    const third = await call(h, 'room.get', { roomId });
    expect(third.body.result.thumbUrl).toBe(url);
    await h.ctx.thumbs!.idle();
    expect(renderer.calls).toBe(1);
  });

  it('GET thumbUrl 回 PNG，revision 前进后旧 URL 404 新 URL 200', async () => {
    const { h, roomId } = await makeRoomWithThumbs();
    await call(h, 'room.get', { roomId });
    await h.ctx.thumbs!.idle();
    const url = new URL((await (await call(h, 'room.get', { roomId })).body).result.thumbUrl);
    const oldPath = url.pathname;
    const hit = await h.app.request(oldPath, { headers: { host: '127.0.0.1' } });
    expect(hit.status).toBe(200);
    expect(hit.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await hit.arrayBuffer()).toString()).toBe(`thumb:${roomId}:320`);

    await call(h, 'ops.apply', {
      roomId,
      baseRevision: 1,
      ops: [{ op: 'node.create', name: 'box', geometry: { kind: 'box', size: [1, 1, 1] } }],
    });
    await call(h, 'room.get', { roomId });
    await h.ctx.thumbs!.idle();
    const fresh = await call(h, 'room.get', { roomId });
    const freshUrl = new URL(fresh.body.result.thumbUrl as string);
    expect(freshUrl.pathname).not.toBe(oldPath);
    expect(freshUrl.pathname).toContain('/2/');
    const stale = await h.app.request(oldPath, { headers: { host: '127.0.0.1' } });
    expect(stale.status).toBe(404);
    expect(codeOf(await stale.json())).toBe('E_THUMB_MISSING');
  });

  it('room.list 同样带 thumbUrl', async () => {
    const { h, roomId } = await makeRoomWithThumbs();
    await call(h, 'room.get', { roomId });
    await h.ctx.thumbs!.idle();
    const list = await call(h, 'room.list', {});
    const row = list.body.result.rooms.find((r: { roomId: string }) => r.roomId === roomId);
    expect(row.thumbUrl).toMatch(new RegExp(`/thumbs/${roomId}/1/[0-9a-f]{12}\\.png$`));
  });

  it('renderer 抛错不冒泡，room.get 正常且无 thumbUrl', async () => {
    const h = makeHarness();
    h.ctx.thumbs = new ThumbsStore({
      getRenderer: () => {
        throw new Error('renderer gone');
      },
    });
    const room = await call(h, 'room.create', { name: 'boom' });
    const roomId = room.body.result.roomId as string;
    const got = await call(h, 'room.get', { roomId });
    expect(got.status).toBe(200);
    await h.ctx.thumbs.idle();
    expect(got.body.result.thumbUrl).toBeUndefined();
    const again = await call(h, 'room.get', { roomId });
    expect(again.status).toBe(200);
    expect(again.body.result.thumbUrl).toBeUndefined();
  });
});

describe('thumbs: HTTP 缓存边界', () => {
  it('未知房间 / 烂 hash / 未生成 → 404 E_THUMB_MISSING', async () => {
    const h = makeHarness();
    const room = await call(h, 'room.create', { name: 'ghost' });
    const roomId = room.body.result.roomId as string;
    for (const path of [
      `/thumbs/${roomId}/1/abc.png`,
      `/thumbs/nope/1/0123456789ab.png`,
      `/thumbs/${roomId}/1/zzzzzzzzzzzz.png`,
    ]) {
      const res = await h.app.request(path, { headers: { host: '127.0.0.1' } });
      expect(res.status).toBe(404);
      expect(codeOf(await res.json())).toBe('E_THUMB_MISSING');
    }
  });
});
