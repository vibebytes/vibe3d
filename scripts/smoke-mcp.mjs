import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const url = process.env.VIBE3D_URL ?? 'http://127.0.0.1:18790';
const token = process.env.VIBE3D_TOKEN ?? 'testtoken123456';

const child = spawn(
  './node_modules/.bin/tsx',
  ['packages/mcp/src/index.ts', '--url', url, '--token', token, '--no-autostart'],
  {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: ['pipe', 'pipe', 'inherit'],
  },
);

const rl = createInterface({ input: child.stdout });
const pending = new Map();
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const resolve = pending.get(msg.id);
  if (resolve) {
    pending.delete(msg.id);
    resolve(msg);
  }
});

let seq = 0;
function call(method, params) {
  const id = ++seq;
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 60_000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

const text = (msg) => msg.result?.content?.[0]?.text ?? '';
const json = (msg) => {
  try {
    return JSON.parse(text(msg));
  } catch {
    return text(msg);
  }
};

try {
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'smoke', version: '0' },
  });
  console.log('initialize', init.result?.serverInfo?.name, init.result?.protocolVersion);

  const list = await call('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  console.log('tools', names.length, names.join(','));

  const room = await call('tools/call', { name: 'vibe3d_create_room', arguments: { name: 'mcp-smoke' } });
  const roomId = json(room).roomId;
  console.log('room', roomId, text(room).slice(0, 160));

  const add = await call('tools/call', {
    name: 'vibe3d_create_node',
    arguments: {
      room_id: roomId,
      kind: 'mesh',
      name: 'Box',
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: [0, 0.5, 0] },
    },
  });
  console.log('create node', text(add).slice(0, 200));

  const scene = await call('tools/call', { name: 'vibe3d_get_scene', arguments: { room_id: roomId } });
  const doc = json(scene);
  console.log('scene nodes', Object.keys(doc.doc?.nodes ?? {}), 'revision', doc.revision);

  const shot = await call('tools/call', { name: 'vibe3d_render_snapshot', arguments: { room_id: roomId } });
  console.log('snapshot isError', shot.result?.isError, text(shot).slice(0, 160));

  const glb = await call('tools/call', { name: 'vibe3d_export_glb', arguments: { room_id: roomId } });
  console.log('export isError', glb.result?.isError, text(glb).slice(0, 160));

  const bad = await call('tools/call', {
    name: 'vibe3d_create_node',
    arguments: { room_id: 'r_nope', kind: 'mesh', shape: 'box' },
  });
  console.log('bad-room isError', bad.result?.isError, text(bad).slice(0, 120));
} finally {
  child.kill('SIGTERM');
}
