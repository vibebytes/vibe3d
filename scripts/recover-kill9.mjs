import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const HOME = '/tmp/vibe3d-kill9';
const PORT = 19000 + (process.pid % 400);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'kill9token123456';
const ROOMS = join(HOME, 'rooms');

let failures = 0;
const ok = (name, extra = '') => console.log(`PASS ${name}${extra ? `  ${extra}` : ''}`);
const bad = (name, extra = '') => {
  failures += 1;
  console.error(`FAIL ${name}${extra ? `  ${extra}` : ''}`);
};
const check = (cond, name, extra = '') => (cond ? ok(name, extra) : bad(name, extra));

function start() {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'packages/daemon/src/index.ts',
      '--port',
      String(PORT),
      '--persist',
      '--log-level',
      'warn',
    ],
    {
      cwd: ROOT,
      env: { ...process.env, VIBE3D_HOME: HOME, VIBE3D_TOKEN: TOKEN, VIBE3D_RENDERER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (b) => {
    log += b;
  });
  child.stderr.on('data', (b) => {
    log += b;
  });
  return { child, log: () => log };
}

async function waitHealth(proc, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(150);
  }
  throw new Error(`daemon 未就绪\n${proc.log().slice(-900)}`);
}

async function rpc(method, params, roomId) {
  const path = roomId ? `/r/${roomId}/rpc` : '/rpc';
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await r.json();
  if (body.error) throw new Error(`${method} → ${body.error.code} ${body.error.message}`);
  return body.result;
}

const disk = (roomId) => JSON.parse(readFileSync(join(ROOMS, `${roomId}.json`), 'utf8'));
const addBox = (roomId, name, x) =>
  rpc(
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name,
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: [x, 0.5, 0] },
    },
    roomId,
  );
const scene = async (roomId) => rpc('scene.get', { roomId }, roomId);
const nodeCount = (doc) => Object.keys(doc.nodes ?? {}).length;

async function stop(child, signal) {
  if (child.exitCode !== null) return child.exitCode;
  const done = new Promise((resolve) => child.once('exit', (code, sig) => resolve({ code, sig })));
  child.kill(signal);
  const timer = sleep(8000).then(() => 'timeout');
  const res = await Promise.race([done, timer]);
  if (res === 'timeout') {
    child.kill('SIGKILL');
    throw new Error(`进程未在 8s 内退出（${signal}）`);
  }
  return res;
}

try {
  execFileSync('pkill', ['-f', `daemon/src/index.ts --port ${PORT}`]);
} catch {}

rmSync(HOME, { recursive: true, force: true });

let daemon;
process.on('exit', () => {
  try {
    daemon?.child.kill('SIGKILL');
  } catch {}
});

daemon = start();
await waitHealth(daemon);
const room = await rpc('room.create', { name: 'kill9', template: 'empty' });
const roomId = room.roomId;
check(/^r_[a-z0-9]{8}$/.test(roomId), '建房成功', roomId);

for (let i = 0; i < 3; i += 1) await addBox(roomId, `box-${i}`, i);
await sleep(1400);
const flushed = disk(roomId);
const flushedRev = flushed.doc.revision ?? flushed.revision;
const flushedNodes = nodeCount(flushed.doc);
check(
  flushedRev === 3 && flushedNodes === 3,
  '防抖窗口后落盘',
  `disk rev=${flushedRev} nodes=${flushedNodes}`,
);

const acked = await addBox(roomId, 'box-3', 3);
const killed = await stop(daemon.child, 'SIGKILL');
check(killed.sig === 'SIGKILL', 'daemon 被 kill -9', `code=${killed.code} sig=${killed.sig}`);

const stillFlushed = disk(roomId);
check(
  (stillFlushed.doc.revision ?? stillFlushed.revision) === flushedRev,
  'kill -9 后磁盘文件仍是最近一次 flush 的完整快照（无半写）',
  `rev=${stillFlushed.doc.revision ?? stillFlushed.revision}`,
);
const leftovers = readdirSync(ROOMS).filter((f) => f.endsWith('.tmp'));
check(leftovers.length === 0, '无 .tmp 残留', leftovers.join(',') || 'none');

daemon = start();
const health = await waitHealth(daemon);
check(health.ok !== false, '同一 home 重启成功（陈旧锁未阻断）');
const recovered = await scene(roomId);
const recRev = recovered.revision;
const recNodes = nodeCount(recovered.doc);
check(recRev === flushedRev, '恢复到的 revision = 最后 flush 的 revision', `rev=${recRev}`);
check(recNodes === flushedNodes, '恢复后节点数与快照一致', `nodes=${recNodes}`);
check(
  recRev <= acked.revision,
  '丢失窗口内的 op 未被误报为已持久化',
  `acked=${acked.revision} restored=${recRev}`,
);

const after = await addBox(roomId, 'box-5', 5);
check(after.revision === recRev + 1, '恢复后 revision 从快照继续递增', `rev=${after.revision}`);
const graceful = await stop(daemon.child, 'SIGTERM');
check(
  graceful.code === 0 || graceful.sig === 'SIGTERM',
  'SIGTERM 正常退出',
  `code=${graceful.code} sig=${graceful.sig}`,
);

daemon = start();
await waitHealth(daemon);
const final = await scene(roomId);
check(
  final.revision === after.revision && nodeCount(final.doc) === recNodes + 1,
  'SIGTERM 的 flushAll 生效：优雅退出不丢 op',
  `rev=${final.revision} nodes=${nodeCount(final.doc)}`,
);
await stop(daemon.child, 'SIGTERM');

console.log(failures === 0 ? 'PASS T15 kill -9 恢复全链路' : `FAIL T15 ${failures} 项断言未过`);
process.exit(failures === 0 ? 0 : 1);
