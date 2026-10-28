#!/usr/bin/env node
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { DAEMON_VERSION } from '@vibebyte/vibe3d-protocol';
import { BlobStore } from './assets/blobstore';
import { createIngest } from './assets/ingest';
import { openInBrowser } from './browser';
import { parseConfig } from './config';
import type { DispatchContext } from './context';
import { flushAll } from './doc/persist';
import { editorMissingWarning, resolveEditorDir } from './editor-dir';
import { JobQueue, MAX_QUEUED } from './jobs/queue';
import { JobStore, sweepExports } from './jobs/store';
import { acquireLock } from './lock';
import { createLogger } from './logger';
import { notifyOpensOpener } from './notify';
import { createRenderer } from './render';
import { RoomManager } from './rooms/manager';
import { createApp } from './server';
import { attachWebSocket } from './ws/attach';
import { createHeartbeat } from './ws/heartbeat';
import { WsHub } from './ws/hub';

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = resolveEditorDir(here);
const editorWarning = editorMissingWarning(EDITOR_DIST);
if (editorWarning) process.stderr.write(`${editorWarning}\n`);

async function main(): Promise<void> {
  let config: ReturnType<typeof parseConfig>;
  try {
    config = parseConfig(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
  }

  const logger = createLogger(config.logLevel, { version: DAEMON_VERSION });
  const dirs = {
    rooms: join(config.home, 'rooms'),
    blobs: join(config.home, 'blobs'),
    exports: join(config.home, 'exports'),
    run: join(config.home, 'run'),
  };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });

  const release = acquireLock(config.home);
  const blobs = new BlobStore(dirs.blobs);
  const hub = new WsHub({ maxSnapshotBytes: config.wsMaxPayloadBytes - 256 * 1024 });

  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    persistDir: config.persist ? dirs.rooms : undefined,
    logger,
    onChange: (room, change) =>
      hub.event(room.id, 'scene.changed', {
        revision: room.revision,
        change: change.kind,
        ops: change.ops,
        actor: { kind: 'agent', id: 'daemon' },
      }),
    isBusy: (roomId) => hub.count(roomId) > 0,
    onEvict: (roomId) => {
      hub.event(roomId, 'room.evicted', { roomId });
      hub.closeRoom(roomId);
    },
  });
  rooms.load();

  if (config.persist && config.gc) {
    const referenced = rooms.list().flatMap((room) => Object.keys(room.doc.assets));
    void blobs
      .prune(referenced, config.gcMaxAgeDays * 86_400_000)
      .then((r) => {
        if (r.removed) logger.info({ event: 'blob.gc', ...r });
      })
      .catch((err: unknown) => logger.warn({ event: 'blob.gc.failed', err: String(err) }));
  }

  const { ingest, inspect } = createIngest({ blobs, roots: config.assetRoots });
  const jobStore = new JobStore();
  const jobs = new JobQueue(
    jobStore,
    {
      progress: (job) =>
        hub.event(job.roomId, 'job.progress', {
          jobId: job.id,
          pct: job.progress,
          ...(job.phase ? { phase: job.phase } : {}),
        }),
      done: (job) =>
        hub.event(job.roomId, 'job.done', {
          jobId: job.id,
          state: 'done',
          url: job.result?.url,
          bytes: job.result?.bytes,
          revision: job.result?.revision,
        }),
      failed: (job) =>
        hub.event(job.roomId, 'job.done', { jobId: job.id, state: 'failed', error: job.error }),
      cancelled: (job) => hub.event(job.roomId, 'job.done', { jobId: job.id, state: 'cancelled' }),
    },
    MAX_QUEUED,
    config.jobConcurrency,
  );
  const ctx: DispatchContext = {
    rooms,
    baseUrl: '',
    token: config.token,
    jobs: { store: jobStore, queue: jobs },
    ingest,
    inspect,
    selection: () => [],
    surfaces: (roomId) => hub.count(roomId),
    autoOpen: new Map(),
    logger,
    ...(config.notifyOpens
      ? { openExternal: notifyOpensOpener(config.notifyOpens) }
      : config.openEditor
        ? { openExternal: (o) => openInBrowser(o.url) }
        : {}),
  };
  ctx.renderer = createRenderer({
    config,
    hub,
    logger,
    baseUrl: () => ctx.baseUrl,
    exportsDir: dirs.exports,
  });

  const app = createApp({
    config,
    ctx,
    blobs,
    logger,
    editorDir: EDITOR_DIST,
    exportsDir: dirs.exports,
    hub,
  });
  const jobSweep = setInterval(() => {
    jobStore.sweep();
    void sweepExports(dirs.exports)
      .then((removed) => {
        if (removed.length) logger.info({ event: 'exports.gc', removed: removed.length });
      })
      .catch((err: unknown) => logger.warn({ event: 'exports.gc.failed', err: String(err) }));
  }, 60_000);
  jobSweep.unref();
  const heartbeat = createHeartbeat({
    hub,
    onEvict: (count) => logger.warn({ event: 'ws.heartbeat.evict', count }, '清理无心跳的编辑器连接'),
  });
  heartbeat.start();
  let lastActivity = Date.now();
  const server = serve({
    fetch: (req, env) => {
      const path = new URL(req.url).pathname;
      if (path !== '/health') lastActivity = Date.now();
      return app.fetch(req, env);
    },
    hostname: config.host,
    port: config.port,
  }) as Server;
  server.once('error', (err: Error) => {
    logger.error(
      { event: 'listen.failed', host: config.host, port: config.port, err: String(err) },
      'daemon 端口监听失败',
    );
    release();
    process.exit(1);
  });

  let wss: ReturnType<typeof attachWebSocket> | undefined;
  let runFile = '';

  const listening = new Promise<number>((ready) => {
    const announce = (): void => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.port;
      ctx.baseUrl = `http://${config.host}:${port}`;
      runFile = join(dirs.run, `${process.pid}.json`);
      writeFileSync(
        runFile,
        JSON.stringify({
          pid: process.pid,
          port,
          host: config.host,
          home: config.home,
          mode: config.persist ? 'persist' : 'ephemeral',
          token: config.token,
          version: DAEMON_VERSION,
          startedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      wss = attachWebSocket({
        server,
        ctx,
        token: config.token,
        hub,
        logger,
        maxPayloadBytes: config.wsMaxPayloadBytes,
      });
      logger.info({
        event: 'listening',
        port,
        mode: config.persist ? 'persist' : 'ephemeral',
        rooms: rooms.size,
        renderer: ctx.renderer?.name ?? 'none',
        url: `http://${config.host}:${port}/${config.token ? `?t=${config.token}` : ''}`,
      });
      ready(port);
    };
    if (server.listening) announce();
    else server.once('listening', announce);
  });
  await listening;

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ event: 'shutdown', signal });
    clearInterval(jobSweep);
    heartbeat.stop();
    wss?.close();
    await Promise.race([
      ctx.renderer?.close?.() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 4000).unref?.()),
    ]);
    flushAll(dirs.rooms, rooms.list());
    server.close();
    if (runFile) {
      try {
        unlinkSync(runFile);
      } catch {
        /* 已删除 */
      }
    }
    release();
    const timer = setTimeout(() => process.exit(0), 1500);
    timer.unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  server.on('close', () => process.exit(0));

  if (config.persist && config.daemonIdleMs > 0) {
    const idleTimer = setInterval(() => {
      if (hub.total() > 0) return;
      const idleFor = Date.now() - lastActivity;
      if (idleFor < config.daemonIdleMs) return;
      logger.warn({ event: 'daemon.idle_exit', idleFor, idleMs: config.daemonIdleMs });
      clearInterval(idleTimer);
      void shutdown('idle');
    }, 5_000);
    idleTimer.unref();
  }
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'daemon 启动失败', err: String(err) })}\n`);
  process.exit(1);
});
