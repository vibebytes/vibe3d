import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseConfig } from '../src/config';
import type { Logger } from '../src/logger';
import { attachWebSocket } from '../src/ws/attach';
import { WsHub } from '../src/ws/hub';
import { makeHarness } from './helpers/harness';

const TOKEN = 'test-token-0123456789';

interface Recording {
  logger: Logger;
  warns: Array<Record<string, unknown>>;
}

function recordingLogger(): Recording {
  const warns: Array<Record<string, unknown>> = [];
  const noop = (): void => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: (obj) => warns.push(obj as Record<string, unknown>),
    error: noop,
    child: () => logger,
  };
  return { logger, warns };
}

async function startServer(maxPayloadBytes?: number): Promise<{
  server: Server;
  port: number;
  roomId: string;
  warns: Array<Record<string, unknown>>;
}> {
  const h = makeHarness();
  const room = h.rooms.create({ name: 'ws-payload' });
  const { logger, warns } = recordingLogger();
  const server = createServer((_req, res) => res.end('ok'));
  attachWebSocket({
    server,
    ctx: h.ctx,
    token: TOKEN,
    hub: new WsHub(),
    logger,
    maxPayloadBytes,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, roomId: room.id, warns };
}

const open = new Set<Server>();

afterEach(async () => {
  for (const server of open) {
    open.delete(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function connect(port: number, roomId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/r/${roomId}/ws?t=${TOKEN}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('ws frame limit config', () => {
  it('defaults to 16 MiB', () => {
    expect(parseConfig(['--token', TOKEN], {}).wsMaxPayloadBytes).toBe(16 * 1024 * 1024);
  });

  it('reads VIBE3D_WS_MAX_PAYLOAD', () => {
    const cfg = parseConfig(['--token', TOKEN], { VIBE3D_WS_MAX_PAYLOAD: '33554432' });
    expect(cfg.wsMaxPayloadBytes).toBe(32 * 1024 * 1024);
  });
});

describe('ws frame limit enforcement', () => {
  it('closes the socket and tags the log when a frame exceeds the limit', async () => {
    const s = await startServer(2048);
    open.add(s.server);
    const ws = await connect(s.port, s.roomId);
    const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
    ws.send(JSON.stringify({ type: 'snapshot.result', requestId: 'big', png: 'a'.repeat(4096) }));
    expect(await closed).toBe(1009);
    const warn = s.warns.find((w) => w.event === 'ws.error');
    expect(warn).toMatchObject({ event: 'ws.error', code: 'E_WS_PAYLOAD', limit: 2048 });
  });

  it('accepts a 2 MiB frame under the default limit', async () => {
    const s = await startServer();
    open.add(s.server);
    const ws = await connect(s.port, s.roomId);
    ws.send(JSON.stringify({ type: 'snapshot.result', requestId: 'big', png: 'a'.repeat(2 * 1024 * 1024) }));
    await new Promise((r) => setTimeout(r, 300));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(s.warns).toHaveLength(0);
    ws.close();
  });
});
