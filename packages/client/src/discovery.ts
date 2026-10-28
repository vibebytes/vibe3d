import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Vibe3DError } from './errors';
import { RpcClient } from './transport';

export interface RunRecord {
  pid: number;
  port: number;
  host: string;
  home: string;
  mode: string;
  token?: string;
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

export function countRooms(home: string): number {
  const dir = join(home, 'rooms');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((entry) => !entry.startsWith('.')).length;
}

export function startBudgetMs(roomCount: number, env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env.VIBE3D_START_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return Math.min(45_000, 15_000 + Math.max(0, roomCount) * 500);
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
      if (typeof raw.port === 'number') {
        if (!alive(raw.pid)) {
          try {
            unlinkSync(file);
          } catch {
            /* 清理失败不影响发现 */
          }
          continue;
        }
        runs.push({ ...raw, file });
      }
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

export function resolveDaemonEntry(): { file: string; loader: string[] } {
  const require = createRequire(import.meta.url);
  let base: string | undefined;
  try {
    base = require.resolve('@vibebyte/vibe3d-daemon');
  } catch {
    base = undefined;
  }
  if (base) {
    const dir = base.replace(/[\\/](src|dist)[\\/][^\\/]+$/, '');
    const dist = join(dir, 'dist', 'index.js');
    if (existsSync(dist)) return { file: dist, loader: [] };
    return { file: base, loader: ['--import', 'tsx'] };
  }
  const sibling = fileURLToPath(new URL('../../daemon/dist/index.js', import.meta.url));
  if (existsSync(sibling)) return { file: sibling, loader: [] };
  throw new Vibe3DError(
    'E_NO_DAEMON',
    `找不到 @vibebyte/vibe3d-daemon，也没有同仓构建产物（${sibling}）。先在仓库根跑 pnpm -r build，或直接用 --url 连接已运行的 daemon。`,
  );
}

const SPAWN_COOLDOWN_DEFAULT_MS = 30_000;

const spawnCooldownMs = (): number => {
  const raw = Number(process.env.VIBE3D_SPAWN_COOLDOWN_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : SPAWN_COOLDOWN_DEFAULT_MS;
};

let lastSpawnFailure: { home: string; at: number } | undefined;

export function resetSpawnGate(): void {
  lastSpawnFailure = undefined;
}

export async function startDaemon(opts: ConnectOptions = {}): Promise<RunRecord> {
  const home = opts.home ?? defaultHome();
  const cooldown = spawnCooldownMs();
  if (cooldown > 0 && lastSpawnFailure?.home === home) {
    const since = Date.now() - lastSpawnFailure.at;
    if (since < cooldown) {
      throw new Vibe3DError(
        'E_NO_DAEMON',
        `daemon 启动刚失败（${Math.ceil((cooldown - since) / 1000)}s 冷却中，防止循环拉起）。请先解决启动问题或查 ${join(home, 'daemon.log')}`,
        { log: join(home, 'daemon.log') },
      );
    }
  }
  const { file, loader } = resolveDaemonEntry();
  const args = [...loader, file, '--home', home, ...(opts.spawnArgs ?? [])];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderrTail = '';
  let spawnError: string | undefined;
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-2000);
  });
  child.on('error', (err) => {
    spawnError = err.message;
  });
  child.once('exit', () => child.stderr?.destroy());
  child.unref();
  const budget = startBudgetMs(countRooms(home));
  const tail = () => (stderrTail.trim() ? `；stderr: ${stderrTail.trim().slice(-500)}` : '');
  const fail = (message: string): never => {
    lastSpawnFailure = { home, at: Date.now() };
    throw new Vibe3DError('E_NO_DAEMON', message, {
      log: join(home, 'daemon.log'),
      stderr: stderrTail.trim() || undefined,
    });
  };
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    await delay(120);
    const run = listRuns(home).find((item) => item.pid === child.pid);
    if (run && (await probe(run))) return run;
    if (spawnError) return fail(`daemon 启动失败：${spawnError}${tail()}`);
    if (child.exitCode !== null) return fail(`daemon 启动失败，退出码 ${child.exitCode}${tail()}`);
  }
  lastSpawnFailure = { home, at: Date.now() };
  throw new Vibe3DError('E_TIMEOUT', `daemon 启动超时（${Math.round(budget / 1000)}s）${tail()}`, {
    log: join(home, 'daemon.log'),
  });
}

export async function probeRemoteHome(url: string, budgetMs = 1500): Promise<string | undefined> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/health`, {
      signal: AbortSignal.timeout(budgetMs),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { home?: unknown };
    return typeof body.home === 'string' && body.home.length > 0 ? body.home : undefined;
  } catch {
    return undefined;
  }
}

export async function connect(opts: ConnectOptions = {}): Promise<RunRecord & { client: RpcClient }> {
  if (opts.url) {
    const token = opts.token ?? process.env.VIBE3D_TOKEN;
    const run: RunRecord = {
      pid: 0,
      port: Number(new URL(opts.url).port || 80),
      host: new URL(opts.url).hostname,
      home: opts.home ?? (await probeRemoteHome(opts.url)) ?? defaultHome(),
      mode: 'remote',
      token,
      version: 'unknown',
      startedAt: new Date().toISOString(),
      file: '',
    };
    return { ...run, client: new RpcClient({ url: opts.url, token }) };
  }
  const home = opts.home ?? defaultHome();
  let run = await findRunning(home);
  if (!run && opts.autostart !== false) {
    try {
      run = await startDaemon(opts);
    } catch (err) {
      // 竞态：另一个客户端可能正在拉起 daemon，等它发布 run 文件后复用
      await delay(1500);
      run = await findRunning(home);
      if (!run) throw err;
    }
  }
  if (!run) throw new Vibe3DError('E_NO_DAEMON', `没有运行中的 daemon（home=${home}）`);
  return { ...run, client: new RpcClient({ url: `http://${run.host}:${run.port}`, token: run.token }) };
}
