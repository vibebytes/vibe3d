import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { type Studio, type StudioOptions, Vibe3DError } from '@vibebyte/vibe3d-client';
import { type ParsedArgs, num, str } from './args';
import { readSceneDocFile } from './scene-io';

export const LOCAL_COMMANDS = new Set(['status', 'room new', 'scene export', 'scene import']);

export function connectOptions(flags: ParsedArgs['flags']): StudioOptions {
  return {
    home: str(flags, 'home') ?? process.env.VIBE3D_HOME,
    url: str(flags, 'url') ?? process.env.VIBE3D_URL,
    token: str(flags, 'token') ?? process.env.VIBE3D_TOKEN,
    autostart: flags.autostart !== false,
  };
}

function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as Partial<T>;
}

function need(value: string | undefined, message: string): string {
  if (!value) throw new Vibe3DError('E_INVALID_PARAMS', message);
  return value;
}

function parseJsonArg(value: string | undefined): unknown {
  if (!value) return undefined;
  const text = value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

export async function runDaemon(parsed: ParsedArgs): Promise<void> {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@vibebyte/vibe3d-daemon');
  let root = dirname(entry);
  while (!existsSync(join(root, 'package.json')) && dirname(root) !== root) root = dirname(root);
  const dist = join(root, 'dist', 'index.js');
  const file = existsSync(dist) ? dist : join(root, 'src', 'index.ts');
  const loader = file.endsWith('.ts') ? ['--import', 'tsx'] : [];
  const argv: string[] = [];
  for (const [key, value] of Object.entries(parsed.flags)) {
    if (['home', 'url', 'pretty', 'autostart'].includes(key)) continue;
    if (value === false) continue;
    argv.push(`--${key}`);
    if (typeof value === 'string') argv.push(value);
  }
  const home = str(parsed.flags, 'home');
  if (home) argv.push('--home', resolve(home));
  await new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, [...loader, file, ...argv], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`daemon 退出码 ${code}`))));
    child.on('error', fail);
  });
}

export async function runLocal(studio: Studio, parsed: ParsedArgs): Promise<unknown> {
  const [group, command, ...rest] = parsed._;
  const { flags } = parsed;

  if (group === 'status') {
    const [health, hello] = await Promise.all([studio.health(), studio.hello()]);
    return { ...health, capabilities: hello.capabilities, home: studio.home };
  }

  if (group === 'room' && command === 'new') {
    const room = await studio.createRoom(
      pick({ name: str(flags, 'name'), template: str(flags, 'template') }) as never,
    );
    const info = await room.info();
    return { ...info, url: `${studio.url}/r/${room.id}` };
  }

  if (group === 'call') {
    const method = need(command, 'call 需要 method');
    return studio.client.call(method, (parseJsonArg(str(flags, 'params')) ?? {}) as Record<string, unknown>, {
      roomId: str(flags, 'room'),
    });
  }

  if (group === 'scene' && command === 'export') {
    const room = studio.room(need(rest[0], 'scene export 需要 roomId'));
    const out = await room.exportScene();
    const dest = str(flags, 'out');
    if (!dest) return out;
    const body = `${JSON.stringify(out.doc, null, 2)}\n`;
    const path = resolve(dest);
    await writeFile(path, body);
    return { path, revision: out.revision, bytes: Buffer.byteLength(body) };
  }

  if (group === 'scene' && command === 'import') {
    const room = studio.room(need(rest[0], 'scene import 需要 roomId'));
    const doc = await readSceneDocFile(need(rest[1], 'scene import 需要 <file>'));
    const expectRevision = num(flags, 'expect-revision');
    return room.importScene(expectRevision === undefined ? { doc } : { doc, expectRevision });
  }

  if (group === 'job' && command === 'wait') {
    const jobId = need(rest[0], 'job wait 需要 <jobId>');
    const timeout = num(flags, 'timeout');
    return studio.job(jobId).wait({ timeoutMs: timeout ? timeout * 1000 : undefined });
  }

  throw new Vibe3DError('E_NO_METHOD', `未知命令：${parsed._.join(' ')}（运行 vibe3d help）`);
}
