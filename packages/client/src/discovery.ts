import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Vibe3DError } from './errors';
import { RpcClient } from './transport';

export interface RunRecord {
  pid: number;
  port: number;
  host: string;
  home: string;
  mode: string;
  token: string;
  version: string;
  startedAt: string;
  file: string;
}

export interface ConnectOptions {
  home?: string;
  url?: string;
  token?: string;
  autostart?: boolean;
  spawnArgs?: string[];
}

export function defaultHome(): string {
  return process.env.VIBE3D_HOME ? resolve(process.env.VIBE3D_HOME) : join(homedir(), '.vibe3d');
}

export function listRuns(home = defaultHome()): RunRecord[] {
  const dir = join(home, 'run');
  if (!existsSync(dir)) return [];
  const runs: RunRecord[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const file = join(dir, entry);
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Omit<RunRecord, 'file'>;
      if (typeof raw.port === 'number' && typeof raw.token === 'string') runs.push({ ...raw, file });
    } catch {
      /* 跳过损坏的 run 文件 */
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probe(run: RunRecord): Promise<boolean> {
  try {
    const client = new RpcClient({ url: `http://${run.host}:${run.port}`, token: run.token });
    await client.health();
    return true;
  } catch {
    return false;
  }
}

export async function findRunning(home = defaultHome()): Promise<RunRecord | undefined> {
  for (const run of listRuns(home)) {
    if (!alive(run.pid)) continue;
    if (await probe(run)) return run;
  }
  return undefined;
}

function daemonEntry(): { file: string; loader: string[] } {
  const require = createRequire(import.meta.url);
  let base: string;
  try {
    base = require.resolve('@vibebyte/vibe3d-daemon');
  } catch {
    throw new Vibe3DError('E_NO_DAEMON', '找不到 @vibebyte/vibe3d-daemon，无法自动拉起 daemon');
  }
  const dir = base.replace(/[\\/](src|dist)[\\/][^\\/]+$/, '');
  const dist = join(dir, 'dist', 'index.js');
  if (existsSync(dist)) return { file: dist, loader: [] };
  return { file: base, loader: ['--import', 'tsx'] };
}

export async function startDaemon(opts: ConnectOptions = {}): Promise<RunRecord> {
  const home = opts.home ?? defaultHome();
  const { file, loader } = daemonEntry();
  const args = [...loader, file, '--home', home, ...(opts.spawnArgs ?? [])];
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await delay(120);
    const run = listRuns(home).find((item) => item.pid === child.pid);
    if (run && (await probe(run))) return run;
    if (child.exitCode !== null) {
      throw new Vibe3DError('E_NO_DAEMON', `daemon 启动失败，退出码 ${child.exitCode}`, {
        log: join(home, 'daemon.log'),
      });
    }
  }
  throw new Vibe3DError('E_TIMEOUT', 'daemon 启动超时');
}

export async function connect(opts: ConnectOptions = {}): Promise<RunRecord & { client: RpcClient }> {
  if (opts.url) {
    const token = opts.token ?? process.env.VIBE3D_TOKEN;
    if (!token) throw new Vibe3DError('E_UNAUTHORIZED', '指定 url 时必须同时提供 token');
    const run: RunRecord = {
      pid: 0,
      port: Number(new URL(opts.url).port || 80),
      host: new URL(opts.url).hostname,
      home: opts.home ?? defaultHome(),
      mode: 'remote',
      token,
      version: 'unknown',
      startedAt: new Date().toISOString(),
      file: '',
    };
    return { ...run, client: new RpcClient({ url: opts.url, token }) };
  }
  const home = opts.home ?? defaultHome();
  const found = await findRunning(home);
  const run = found ?? (opts.autostart === false ? undefined : await startDaemon(opts));
  if (!run) throw new Vibe3DError('E_NO_DAEMON', `没有运行中的 daemon（home=${home}）`);
  return { ...run, client: new RpcClient({ url: `http://${run.host}:${run.port}`, token: run.token }) };
}
