import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = join(root, 'fixtures/golden');
const port = Number(process.env.GOLDEN_PORT ?? 18812);
const token = 'golden-token';
const base = `http://127.0.0.1:${port}`;
const update = process.argv.includes('--update');

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

const home = mkdtempSync(join(tmpdir(), 'vibe3d-golden-'));
const log = join(home, 'daemon.log');
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

const stop = () => {
  child.kill('SIGTERM');
};
process.on('exit', stop);

for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`${base}/health`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
  if (i === 119) {
    console.error(output.slice(-2000));
    throw new Error('daemon 未就绪');
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const dims = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const cases = [
  { file: '1280x720-showroom.png', preset: null },
  { file: '1280x720-stage-cine.png', preset: 'cine' },
  { file: '1280x720-stage-flat.png', preset: 'flat' },
];
const manifestPath = join(goldenDir, 'manifest.json');
const fullSha = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = {
  version: 1,
  renderer: 'auto',
  template: 'showroom',
  viewport: [1280, 720],
  deviceScaleFactor: 1,
  cases: [],
};

const { roomId } = await rpc('/rpc', 'room.create', { name: 'golden', template: 'showroom' });
const report = [];
mkdirSync(goldenDir, { recursive: true });
for (const c of cases) {
  if (c.preset) await rpc(`/r/${roomId}/rpc`, 'stage.set', { stage: { preset: c.preset } });
  const shot = await rpc(`/r/${roomId}/rpc`, 'render.snapshot', { width: 1280, height: 720 });
  const png = Buffer.from(shot.base64, 'base64');
  const okMagic = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const [w, h] = dims(png);
  if (!okMagic || w !== 1280 || h !== 720) throw new Error(`${c.file} 无效 PNG ${w}x${h} magic=${okMagic}`);
  const target = join(goldenDir, c.file);
  const prev = existsSync(target) ? readFileSync(target) : null;
  const same = prev ? prev.equals(png) : false;
  if (update || !prev) writeFileSync(target, png);
  if (!same && prev) {
    mkdirSync(join(goldenDir, '.actual'), { recursive: true });
    writeFileSync(join(goldenDir, '.actual', c.file), png);
  }
  const diff = !prev ? 'written' : same ? 'identical' : `changed sha ${sha(prev)}->${sha(png)}`;
  report.push({ file: c.file, bytes: png.length, sha: sha(png), diff, same, replaced: !prev || update });
  manifest.cases.push({
    file: c.file,
    preset: c.preset,
    width: w,
    height: h,
    bytes: png.length,
    sha256: fullSha(png),
  });
}
manifest.generatedAt = update ? new Date().toISOString() : undefined;
if (update || !existsSync(manifestPath)) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

let manifestOk = true;
if (!update) {
  try {
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifestOk =
      saved.version === manifest.version && JSON.stringify(saved.cases) === JSON.stringify(manifest.cases);
  } catch (err) {
    manifestOk = false;
  }
  if (!manifestOk) console.error('manifest.json 与渲染结果不一致，确认后跑 pnpm golden:update');
}
await rpc('/rpc', 'room.close', { roomId, purge: true }).catch(() => {});
console.log(JSON.stringify({ roomId, update, manifestOk, report }, null, 2));
stop();
await new Promise((r) => setTimeout(r, 1500));
process.exit(report.every((r) => r.same || r.replaced) && manifestOk ? 0 : 1);
