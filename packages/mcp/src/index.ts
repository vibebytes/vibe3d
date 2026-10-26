#!/usr/bin/env node
import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import { createMemoRuntime, prewarm } from './bootstrap';
import { parseFlags } from './flags';
import { createServer } from './server';
import { ToolRuntime } from './tools';

const flags = parseFlags(process.argv.slice(2));
const opts: StudioOptions = {
  home: typeof flags.home === 'string' ? flags.home : undefined,
  url: typeof flags.url === 'string' ? flags.url : undefined,
  token: typeof flags.token === 'string' ? flags.token : undefined,
  autostart: flags.autostart !== false,
};
const legacyRoom = typeof flags.room === 'string' ? flags.room : undefined;

const memo = createMemoRuntime<ToolRuntime>(() =>
  Studio.connect(opts).then((studio) => {
    process.stderr.write(
      `${JSON.stringify({ level: 'info', msg: 'vibe3d mcp 已连接 daemon', url: studio.url })}\n`,
    );
    return new ToolRuntime(studio, legacyRoom);
  }),
);

const server = createServer({ runtime: memo.get, onRuntimeError: () => memo.reset() });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
server.start();
prewarm(memo.get, (err) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'warn',
      msg: 'vibe3d mcp 预热失败，首次工具调用将重试',
      err: err instanceof Error ? err.message : String(err),
    })}\n`,
  );
});
