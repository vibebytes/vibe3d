import { afterEach, describe, expect, it } from 'vitest';
import { call, makeHarness, type Harness } from './helpers/harness';
import { notifyOpensOpener } from '../src/notify';

type FetchCall = { input: string | URL; init?: RequestInit };

function recordingFetch(status = 200, fail = false): { calls: FetchCall[]; fetch: typeof fetch } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (fail) throw new Error('ECONNREFUSED');
    return new Response('{}', { status });
  }) as typeof fetch;
  return { calls, fetch: fetchImpl };
}

let harness: Harness | undefined;
afterEach(() => {
  harness = undefined;
});

describe('notifyOpensOpener', () => {
  it('POSTs {url, roomId} to the endpoint and resolves true on 2xx', async () => {
    const { calls, fetch: fetchImpl } = recordingFetch();
    const open = notifyOpensOpener('http://127.0.0.1:9/vibe3d/opens', fetchImpl);
    await expect(
      open({ url: 'http://127.0.0.1:7100/editor/r/r_abc12345?t=tok', roomId: 'r_abc12345' }),
    ).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.input)).toBe('http://127.0.0.1:9/vibe3d/opens');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      url: 'http://127.0.0.1:7100/editor/r/r_abc12345?t=tok',
      roomId: 'r_abc12345',
    });
  });

  it('resolves false on non-2xx and on fetch failure', async () => {
    const failing = recordingFetch(502);
    await expect(
      notifyOpensOpener('http://127.0.0.1:9/x', failing.fetch)({ url: 'http://x/editor/r/r_abc12345' }),
    ).resolves.toBe(false);
    const broken = recordingFetch(200, true);
    await expect(
      notifyOpensOpener('http://127.0.0.1:9/x', broken.fetch)({ url: 'http://x/editor/r/r_abc12345' }),
    ).resolves.toBe(false);
  });
});

describe('autoOpen via notify-opens', () => {
  it('room.create returns a tokenised openUrl and notifies once', async () => {
    const h = makeHarness();
    harness = h;
    const { calls, fetch: fetchImpl } = recordingFetch();
    h.ctx.openExternal = notifyOpensOpener('http://127.0.0.1:9/vibe3d/opens', fetchImpl);
    const { body } = await call(h, 'room.create', { name: '文档' });
    const result = body.result;
    expect(result.roomId).toMatch(/^r_[a-z0-9]{8}$/);
    expect(result.openUrl).toBe(`${result.url}?t=${h.token}`);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ url: result.openUrl, roomId: result.roomId });
  });

  it('notifies once per room: later visual mutations on the same room do not re-POST', async () => {
    const h = makeHarness();
    const { calls, fetch: fetchImpl } = recordingFetch();
    h.ctx.openExternal = notifyOpensOpener('http://127.0.0.1:9/vibe3d/opens', fetchImpl);
    const { body } = await call(h, 'room.create', { name: '文档' });
    const roomId = body.result.roomId;
    await call(h, 'ops.apply', { roomId, ops: [{ op: 'stage.set', env: { background: [0.1, 0.1, 0.1, 1] } }] });
    expect(calls).toHaveLength(1);
  });

  it('does not notify when an editor surface is already attached', async () => {
    const h = makeHarness();
    const { calls, fetch: fetchImpl } = recordingFetch();
    h.ctx.openExternal = notifyOpensOpener('http://127.0.0.1:9/vibe3d/opens', fetchImpl);
    h.ctx.surfaces = () => 1;
    await call(h, 'room.create', { name: '文档' });
    expect(calls).toHaveLength(0);
  });

  it('room without an opener stays silent (CLI default)', async () => {
    const h = makeHarness();
    const { body } = await call(h, 'room.create', { name: '文档' });
    expect(body.result.openUrl).toBe(`${body.result.url}?t=${h.token}`);
  });
});
