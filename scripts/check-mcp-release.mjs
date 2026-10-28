import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const node = process.execPath;

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });

const mcpDist = join(root, 'packages/mcp/dist/index.js');
const daemonDist = join(root, 'packages/daemon/dist/index.js');
if (!existsSync(mcpDist) || !existsSync(daemonDist)) {
  throw new Error('build mcp and daemon before check-mcp-release');
}

const mcpStat = statSync(mcpDist);
const bundleLimit = Math.floor(1.6 * 1024 * 1024);
if (mcpStat.size > bundleLimit) throw new Error(`mcp bundle too large: ${mcpStat.size} > ${bundleLimit}`);
if (!readFileSync(mcpDist, 'utf8').startsWith('#!/usr/bin/env node')) throw new Error('mcp bin missing shebang');
if ((mcpStat.mode & 0o111) === 0) throw new Error('mcp bin is not executable');

const pack = (dir) => {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = `${String(pkg.name).replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
  execFileSync('pnpm', ['pack'], { cwd: dir, stdio: 'inherit' });
  const packed = join(dir, file);
  if (!existsSync(packed)) throw new Error(`pack did not write ${packed}`);
  return packed;
};

const mcpTgz = pack(join(root, 'packages/mcp'));
const daemonTgz = pack(join(root, 'packages/daemon'));

const listTgz = (file) => execFileSync('tar', ['-tzf', file], { encoding: 'utf8' });
const mcpFiles = listTgz(mcpTgz);
const daemonFiles = listTgz(daemonTgz);
for (const needed of ['package/dist/index.js', 'package/dist/schema.json']) {
  if (!mcpFiles.includes(needed)) throw new Error(`mcp pack missing ${needed}`);
}
for (const needed of ['package/dist/index.js', 'package/dist/editor/index.html']) {
  if (!daemonFiles.includes(needed)) throw new Error(`daemon pack missing ${needed}`);
}
if (!daemonFiles.includes('package/dist/editor/assets/')) {
  const hasAsset = daemonFiles.split('\n').some((line) => line.startsWith('package/dist/editor/assets/'));
  if (!hasAsset) throw new Error('daemon pack missing editor assets');
}

const readPacked = (tgz) => {
  const json = execFileSync('tar', ['-xOzf', tgz, 'package/package.json'], { encoding: 'utf8' });
  return JSON.parse(json);
};
const mcpPkg = readPacked(mcpTgz);
const daemonPkg = readPacked(daemonTgz);
if (JSON.stringify(mcpPkg).includes('workspace:')) throw new Error('mcp pack still has workspace:');
if (JSON.stringify(daemonPkg).includes('workspace:')) throw new Error('daemon pack still has workspace:');
if (!String(mcpPkg.engines?.node).includes('22')) throw new Error('mcp engines');
if (!String(daemonPkg.engines?.node).includes('22')) throw new Error('daemon engines');
const daemonDep = mcpPkg.dependencies?.['@vibebyte/vibe3d-daemon'];
if (daemonDep !== daemonPkg.version) throw new Error(`daemon dep ${daemonDep} != ${daemonPkg.version}`);
const exported = daemonPkg.exports?.['.']?.default ?? daemonPkg.exports?.['.'];
if (!String(exported).includes('dist')) throw new Error(`daemon exports ${JSON.stringify(daemonPkg.exports)}`);

const home = mkdtempSync(join(tmpdir(), 'vibe3d-install-'));
const scope = join(home, 'node_modules/@vibebyte');
execFileSync('mkdir', ['-p', scope]);
const unpack = (tgz, name) => {
  execFileSync('tar', ['-xzf', tgz, '-C', scope]);
  execFileSync('mv', [join(scope, 'package'), join(scope, name)]);
};
unpack(daemonTgz, 'vibe3d-daemon');
unpack(mcpTgz, 'vibe3d-mcp');
const doctor = execFileSync(node, [join(home, 'node_modules/@vibebyte/vibe3d-mcp/dist/index.js'), '--doctor', '--json'], {
  cwd: home,
  encoding: 'utf8',
  env: { ...process.env, VIBE3D_HOME: join(home, 'home') },
});
const report = JSON.parse(doctor);
const entry = report.daemonEntry?.file ?? '';
if (!entry.endsWith('node_modules/@vibebyte/vibe3d-daemon/dist/index.js') && !entry.includes('@vibebyte/vibe3d-daemon/dist/index.js')) {
  throw new Error(`daemon entry not installed: ${entry} ${doctor}`);
}
if (!existsSync(join(home, 'node_modules/@vibebyte/vibe3d-daemon/dist/editor/index.html'))) {
  throw new Error('installed daemon is missing editor/index.html');
}

const app = mkdtempSync(join(tmpdir(), 'vibe3d-npm-'));
execFileSync('npm', ['init', '-y'], { cwd: app, stdio: 'inherit' });
execFileSync('npm', ['install', '--ignore-scripts', daemonTgz], { cwd: app, stdio: 'inherit' });
execFileSync('npm', ['install', '--ignore-scripts', '--offline', mcpTgz], { cwd: app, stdio: 'inherit' });
const installedMcp = join(app, 'node_modules/@vibebyte/vibe3d-mcp/dist/index.js');
const installedDaemon = join(app, 'node_modules/@vibebyte/vibe3d-daemon/dist/index.js');
if (!existsSync(installedMcp) || !existsSync(installedDaemon)) {
  throw new Error('npm install did not place mcp and daemon');
}

const dataHome = join(app, 'home');
const require = createRequire(join(root, 'packages/mcp/package.json'));
const { Client } = await import(require.resolve('@modelcontextprotocol/client'));
const { StdioClientTransport } = await import(require.resolve('@modelcontextprotocol/client/stdio'));
const transport = new StdioClientTransport({
  command: node,
  args: [installedMcp],
  cwd: app,
  env: { ...process.env, VIBE3D_HOME: dataHome },
  stderr: 'pipe',
});
const client = new Client({ name: 'release-check', version: '0' });
await client.connect(transport);
try {
  const status = await client.callTool({ name: 'vibe3d_status', arguments: {} });
  if (status.isError) throw new Error(`vibe3d_status failed: ${JSON.stringify(status.content).slice(0, 400)}`);
  const runs = readdirSync(join(dataHome, 'run')).filter((name) => name.endsWith('.json'));
  if (runs.length === 0) throw new Error('autostart did not write a daemon run file');
  const rec = JSON.parse(readFileSync(join(dataHome, 'run', runs[0]), 'utf8'));
  const editor = await fetch(`http://${rec.host}:${rec.port}/editor/`);
  const html = await editor.text();
  if (editor.status !== 200 || !html.includes('id="root"')) {
    throw new Error(`editor page ${editor.status}: ${html.slice(0, 180)}`);
  }
  console.log('mcp release check ok', {
    mcp: mcpPkg.version,
    daemon: daemonPkg.version,
    entry,
    status: 'ok',
    editor: editor.status,
  });
} finally {
  await client.close().catch(() => undefined);
  for (const name of readdirSync(join(dataHome, 'run')).filter((item) => item.endsWith('.json'))) {
    const rec = JSON.parse(readFileSync(join(dataHome, 'run', name), 'utf8'));
    if (typeof rec.pid === 'number') {
      try {
        process.kill(rec.pid, 'SIGTERM');
      } catch {
        /* 已经退出 */
      }
    }
  }
}