#!/usr/bin/env node
import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import { createServer } from './server';
import { ToolRuntime } from './tools';

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const opts: StudioOptions = {
  home: typeof flags.home === 'string' ? flags.home : undefined,
  url: typeof flags.url === 'string' ? flags.url : undefined,
  token: typeof flags.token === 'string' ? flags.token : undefined,
  autostart: flags.autostart !== false,
};
const legacyRoom = typeof flags.room === 'string' ? flags.room : undefined;

let runtime: Promise<ToolRuntime> | undefined;
const getRuntime = (): Promise<ToolRuntime> => {
  runtime ??= Studio.connect(opts).then((studio) => {
    process.stderr.write(
      `${JSON.stringify({ level: 'info', msg: 'vibe3d mcp 已连接 daemon', url: studio.url })}\n`,
    );
    return new ToolRuntime(studio, legacyRoom);
  });
  return runtime;
};

const server = createServer({ runtime: getRuntime });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
server.start();
