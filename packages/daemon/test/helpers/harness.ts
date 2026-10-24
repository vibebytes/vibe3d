import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobStore } from '../../src/assets/blobstore';
import { createIngest } from '../../src/assets/ingest';
import { type Config, parseConfig } from '../../src/config';
import type { DispatchContext } from '../../src/context';
import type { Logger } from '../../src/logger';
import { RoomManager } from '../../src/rooms/manager';
import { createApp } from '../../src/server';

export function silentLogger(): Logger {
  const noop = (): void => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

export interface Harness {
  root: string;
  dirs: { rooms: string; blobs: string; exports: string; editor: string };
  config: Config;
  ctx: DispatchContext;
  rooms: RoomManager;
  blobs: BlobStore;
  logger: Logger;
  app: ReturnType<typeof createApp>;
  token: string;
}

export function makeHarness(opts: { maxRooms?: number; persist?: boolean } = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'v3d-cov-'));
  const dirs = {
    rooms: join(root, 'rooms'),
    blobs: join(root, 'blobs'),
    exports: join(root, 'exports'),
    editor: join(root, 'editor'),
  };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dirs.editor, 'index.html'), '<!doctype html><title>vibe3d</title>');
  writeFileSync(join(dirs.editor, 'app.js'), 'console.log(1)');
  mkdirSync(join(dirs.editor, 'vendor', 'draco'), { recursive: true });
  writeFileSync(join(dirs.editor, 'vendor', 'draco', 'decoder.js'), 'export {}');

  const token = 'test-token-0123456789';
  const config = parseConfig(['--token', token, '--renderer', 'none', '--home', root], {});
  const logger = silentLogger();
  const blobs = new BlobStore(dirs.blobs);
  const { ingest, inspect } = createIngest({ blobs });
  const rooms = new RoomManager({
    maxRooms: opts.maxRooms ?? 8,
    persistDir: opts.persist ? dirs.rooms : undefined,
    logger,
  });
  const ctx: DispatchContext = {
    rooms,
    baseUrl: 'http://127.0.0.1:0',
    ingest,
    inspect,
    selection: () => [],
    autoOpen: new Map(),
  };
  const app = createApp({
    config,
    ctx,
    blobs,
    logger,
    editorDir: dirs.editor,
    exportsDir: dirs.exports,
  });
  return { root, dirs, config, ctx, rooms, blobs, logger, app, token };
}

export async function post(
  h: Harness,
  path: string,
  body: unknown,
  init: { token?: string | null; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: '127.0.0.1',
    ...init.headers,
  };
  const token = init.token === undefined ? h.token : init.token;
  if (token) headers.authorization = `Bearer ${token}`;
  return await h.app.request(path, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function call(
  h: Harness,
  method: string,
  params: Record<string, unknown> = {},
  roomId?: string,
): Promise<{ status: number; body: any }> {
  const path = roomId ? `/r/${roomId}/rpc` : '/rpc';
  const res = await post(h, path, { jsonrpc: '2.0', id: 1, method, params });
  return { status: res.status, body: await res.json() };
}

export function codeOf(body: any): string {
  return body?.error?.data?.code ?? body?.error?.code;
}
