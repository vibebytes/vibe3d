import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.BENCH_PORT ?? 18813);
const token = 'bench-token';
const base = `http://127.0.0.1:${port}`;
const HOT_ROUNDS = Number(process.env.BENCH_HOT_ROUNDS ?? 5);
const HOT_BUDGET_MS = 1500;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (v) => Math.round(v * 10) / 10;

async function rpc(path, method, params = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} -> ${JSON.stringify(json.error)}`);
  return json.result;
}

async function cliStartup(rounds = 5) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const t = performance.now();
    await new Promise((res, rej) => {
      const c = spawn(process.execPath, ['packages/cli/dist/index.js', '--help'], {
        cwd: root,
        stdio: 'ignore',
      });
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`cli exit ${code}`))));
      c.on('error', rej);
    });
    samples.push(performance.now() - t);
  }
  return {
    samples: samples.map(ms),
    median: ms(median(samples)),
    min: ms(Math.min(...samples)),
    max: ms(Math.max(...samples)),
  };
}

async function snapshotBench() {
  const home = mkdtempSync(join(tmpdir(), 'vibe3d-bench-'));
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'packages/daemon/src/index.ts', '--port', String(port), '--log-level', 'warn'],
    {
      cwd: root,
      env: {
        ...process.env,
        VIBE3D_HOME: home,
        VIBE3D_TOKEN: token,
        VIBE3D_RENDERER: 'auto',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  const stop = () => child.kill('SIGTERM');
  process.on('exit', stop);

  let boot = 0;
  const bootStart = performance.now();
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        boot = performance.now() - bootStart;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!boot) {
    console.error(output.slice(-2000));
    throw new Error('daemon 未就绪');
  }

  const { roomId } = await rpc('/rpc', 'room.create', { name: 'bench', template: 'showroom' });
  const coldStart = performance.now();
  await rpc(`/r/${roomId}/rpc`, 'render.snapshot', { width: 1280, height: 720 });
  const cold = performance.now() - coldStart;

  const hot = [];
  for (let i = 0; i < HOT_ROUNDS; i++) {
    const t = performance.now();
    await rpc(`/r/${roomId}/rpc`, 'render.snapshot', { width: 1280, height: 720 });
    hot.push(performance.now() - t);
  }
  await rpc('/rpc', 'room.close', { roomId, purge: true }).catch(() => {});
  stop();
  return {
    daemonBootMs: ms(boot),
    snapshotColdMs: ms(cold),
    snapshotHotMs: ms(median(hot)),
    snapshotHotSamples: hot.map(ms),
  };
}

const cli = await cliStartup();
const snap = await snapshotBench();
const overBudget = snap.snapshotHotMs > HOT_BUDGET_MS;
console.log(
  JSON.stringify(
    { cliStartupMs: cli, ...snap, hotBudgetMs: HOT_BUDGET_MS, overBudget, date: new Date().toISOString() },
    null,
    2,
  ),
);
process.exit(overBudget ? 1 : 0);
