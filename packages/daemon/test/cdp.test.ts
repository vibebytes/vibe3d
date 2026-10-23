import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { Cdp, CdpError } from '../src/render/cdp';

let server: Server;
let wss: WebSocketServer;
let port: number;

beforeAll(async () => {
  server = createServer();
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'Echo') {
        ws.send(JSON.stringify({ id: msg.id, result: { ok: msg.params } }));
        return;
      }
      if (msg.method === 'Fail') {
        ws.send(JSON.stringify({ id: msg.id, error: { message: 'boom' } }));
        return;
      }
      if (msg.method === 'Event') {
        ws.send(JSON.stringify({ id: msg.id, result: 'after-event', sessionId: 's1' }));
        ws.send(JSON.stringify({ method: 'Notice', params: { n: 1 }, sessionId: 's1' }));
        ws.send('not-json');
        ws.send(JSON.stringify({ method: 'Unknown' }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const client of wss.clients) client.terminate();
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Cdp', () => {
  it('connects, sends commands and dispatches events', async () => {
    const cdp = await Cdp.connect(`ws://127.0.0.1:${port}`);
    const seen: Array<{ params: Record<string, unknown>; sid?: string }> = [];
    const off = cdp.on('Notice', (params, sid) => {
      seen.push({ params, sid });
      throw new Error('listener boom');
    });
    await expect(cdp.send('Echo', { a: 1 })).resolves.toEqual({ ok: { a: 1 } });
    await expect(cdp.send('Event')).resolves.toBe('after-event');
    cdp.on('Notice', () => {
      throw new Error('second listener boom');
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([{ params: { n: 1 }, sid: 's1' }]);
    off();
    cdp.close();
    expect(cdp.isClosed).toBe(true);
  });

  it('rejects failed commands and times out silent ones', async () => {
    const cdp = await Cdp.connect(`ws://127.0.0.1:${port}`);
    const failed = cdp.send('Fail').catch((err) => err);
    await expect(failed).resolves.toBeInstanceOf(CdpError);
    await expect(failed).resolves.toMatchObject({ method: '1' });
    await expect(cdp.send('Drop', {}, undefined, 30)).rejects.toMatchObject({ method: 'Drop' });
    cdp.close();
  });

  it('rejects pending work when the socket closes', async () => {
    const cdp = await Cdp.connect(`ws://127.0.0.1:${port}`);
    const pending = cdp.send('Drop', {}, undefined, 5_000).catch((err) => err);
    cdp.close();
    await expect(pending).resolves.toMatchObject({ method: 'close' });
    await expect(cdp.send('Echo')).rejects.toMatchObject({ method: 'Echo' });
  });

  it('surfaces connection failures', async () => {
    await expect(Cdp.connect('ws://127.0.0.1:1', 200)).rejects.toMatchObject({ method: 'connect' });
  });
});
