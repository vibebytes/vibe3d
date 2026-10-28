#!/usr/bin/env node
import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import { createMemoRuntime, prewarm } from './bootstrap';
import { formatDoctor, runDoctor } from './doctor';
import { parseFlags } from './flags';
import { logEvent } from './log';
import { assertNode } from './node-check';
import { createServer } from './server';
import { ToolRuntime } from './tools';
import { startStdio } from './transport';
import { mcpVersion } from './version';

process.on('uncaughtException', (err) => {
  logEvent({ event: 'uncaught', err: err.stack ?? String(err) });
});
process.on('unhandledRejection', (reason) => {
  logEvent({
    event: 'unhandledRejection',
    err: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
});
process.stdout.on('error', (err) => {
  logEvent({ event: 'stdout.error', err: String(err) });
});
process.stdout.on('close', () => {
  logEvent({ event: 'stdout.close' });
});
process.stdin.on('error', (err) => {
  logEvent({ event: 'stdin.error', err: String(err) });
});

try {
  assertNode(process.version);
} catch (err) {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: err instanceof Error ? err.message : String(err) })}\n`,
  );
  process.exit(1);
}

const flags = parseFlags(process.argv.slice(2));

if (flags.doctor === true) {
  const report = await runDoctor({ home: typeof flags.home === 'string' ? flags.home : undefined });
  process.stdout.write(flags.json === true ? `${JSON.stringify(report)}\n` : formatDoctor(report));
  process.exit(0);
}

const opts: StudioOptions = {
  home: typeof flags.home === 'string' ? flags.home : undefined,
  url: typeof flags.url === 'string' ? flags.url : undefined,
  token: typeof flags.token === 'string' ? flags.token : undefined,
  autostart: flags.autostart !== false && flags['no-autostart'] !== true,
};
const forceRestart = flags['restart-daemon'] === true || process.env.VIBE3D_RESTART_DAEMON === '1';
const legacyRoom = typeof flags.room === 'string' ? flags.room : undefined;

// 只在进程启动后的第一次连接刷新 daemon；运行中因报错重连不能反复重启它
let firstConnect = true;
const memo = createMemoRuntime<ToolRuntime>(() => {
  const fresh = firstConnect;
  firstConnect = false;
  const connectOpts: StudioOptions = fresh
    ? { ...opts, expectVersion: mcpVersion(), restart: forceRestart }
    : opts;
  return Studio.connect(connectOpts).then((studio) => {
    process.stderr.write(
      `${JSON.stringify({ level: 'info', msg: 'vibe3d mcp 已连接 daemon', url: studio.url })}\n`,
    );
    return new ToolRuntime(studio, legacyRoom);
  });
});

const server = createServer({ runtime: memo.get, onRuntimeError: () => memo.reset() });

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(sig, () => {
    logEvent({ event: 'signal', sig });
    process.exit(0);
  });
}

startStdio(server).catch((err: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: err instanceof Error ? err.message : String(err) })}\n`,
  );
  process.exit(1);
});
prewarm(memo.get, (err) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'warn',
      msg: 'vibe3d mcp 预热失败，首次工具调用将重试',
      err: err instanceof Error ? err.message : String(err),
    })}\n`,
  );
});
