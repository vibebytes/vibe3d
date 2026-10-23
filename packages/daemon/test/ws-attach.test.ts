import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { Room } from '../src/rooms/room';
import { attachWebSocket } from '../src/ws/attach';
import { WsHub } from '../src/ws/hub';
import { type Harness, makeHarness } from './helpers/harness';

interface Frames {
  ws: WebSocket;
  all: any[];
  next(pred: (f: any) => boolean, timeoutMs?: number): Promise<any>;
}

let h: Harness;
let hub: WsHub;
let server: Server;
let port: number;
let room: Room;
const seenFrames: unknown[] = [];

function connect(path: string, headers?: Record<string, string>): Promise<Frames> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    const all: any[] = [];
    const waiters: Array<{ pred: (f: any) => boolean; resolve: (f: any) => void }> = [];

    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      all.push(frame);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.pred(frame)) {
          waiters.splice(i, 1);
          w.resolve(frame);
        }
      }
    });
    ws.on('error', reject);
    ws.on('open', () =>
      resolve({
        ws,
        all,
        next(pred, timeoutMs = 2_000) {
          const hit = all.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error('frame timeout')), timeoutMs);
            waiters.push({
              pred,
              resolve: (f) => {
                clearTimeout(timer);
                res(f);
              },
            });
          });
        },
      }),
    );
  });
}

function expectReject(path: string, headers?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      ws.terminate();
      resolve(res.statusCode ?? 0);
    });
    ws.on('open', () => {
      ws.close();
      reject(new Error('connection should have been rejected'));
    });
    ws.on('error', () => undefined);
  });
}

async function shutdown(c: Frames): Promise<void> {
  c.ws.close();
  for (let i = 0; i < 100 && hub.count(room.id) > 0; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeAll(async () => {
  h = makeHarness();
  room = h.rooms.create({ name: 'ws-test' });
  hub = new WsHub();
  server = createServer((_req, res) => res.end('ok'));
  attachWebSocket({
    server,
    ctx: h.ctx,
    token: h.token,
    hub,
    logger: h.logger,
    onClientFrame: (_id, _ws, frame) => seenFrames.push(frame),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('attachWebSocket', () => {
  it('rejects unknown paths, bad room ids, bad tokens and missing rooms', async () => {
    expect(await expectReject('/health')).toBe(404);
    expect(await expectReject(`/r/nope/ws?t=${h.token}`)).toBe(400);
    expect(await expectReject(`/r/${room.id}/ws?t=wrong`)).toBe(401);
    expect(await expectReject(`/r/r_aaaaaaaa/ws?t=${h.token}`)).toBe(404);
  });

  it('accepts the token from the cookie header', async () => {
    const c = await connect(`/r/${room.id}/ws`, { cookie: `vibe3d_token=${h.token}` });
    const hello = await c.next((f) => f.type === 'hello');
    expect(hello.roomId).toBe(room.id);
    await shutdown(c);
  });

  it('sends hello, answers ping and resolves snapshot requests', async () => {
    const c = await connect(`/r/${room.id}/ws?t=${h.token}`);
    const hello = await c.next((f) => f.type === 'hello');
    expect(hello).toMatchObject({ roomId: room.id, revision: room.revision, editors: 1 });

    c.ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await c.next((f) => f.type === 'pong');
    expect(typeof pong.t).toBe('number');

    const pending = hub.requestSnapshot(room.id, 2_000);
    const request = await c.next((f) => f.type === 'event' && f.event === 'snapshot.request');
    c.ws.send(
      JSON.stringify({
        type: 'snapshot.result',
        requestId: request.data.requestId,
        png: 'data:image/png;base64,AAA',
      }),
    );
    await expect(pending).resolves.toBe('data:image/png;base64,AAA');
    await shutdown(c);
  });

  it('forwards client frames and drops malformed ones', async () => {
    const c = await connect(`/r/${room.id}/ws?t=${h.token}`);
    await c.next((f) => f.type === 'hello');
    const before = seenFrames.length;
    c.ws.send('not json');
    c.ws.send(JSON.stringify({ type: 'selection.changed', ids: ['n1'] }));
    await new Promise((r) => setTimeout(r, 150));
    expect(seenFrames.slice(before)).toEqual([{ type: 'selection.changed', ids: ['n1'] }]);
    await shutdown(c);
  });

  it('removes the client from the hub on close', async () => {
    const c = await connect(`/r/${room.id}/ws?t=${h.token}`);
    await c.next((f) => f.type === 'hello');
    expect(hub.count(room.id)).toBeGreaterThan(0);
    await shutdown(c);
    expect(hub.count(room.id)).toBe(0);
  });
});
