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

const failures = [];
function assert(ok, label, detail = '') {
  if (ok) {
    console.log(`ok   ${label}`);
    return;
  }
  failures.push(label);
  console.error(`FAIL ${label} ${detail}`.trim());
}

try {
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'smoke', version: '0' },
  });
  console.log('initialize', init.result?.serverInfo?.name, init.result?.protocolVersion);

  const list = await call('tools/list', {});
  const tools = list.result.tools;
  const names = tools.map((t) => t.name);
  assert(names.length === 37, 'tools/list == 37', `got ${names.length}`);
  const roomArgTools = tools
    .filter((t) => t.inputSchema?.properties?.room_id)
    .map((t) => t.name)
    .sort();
  assert(
    JSON.stringify(roomArgTools) ===
      JSON.stringify(['vibe3d_close_room', 'vibe3d_get_room', 'vibe3d_open_editor']),
    'room_id only on 3 roomArg tools',
    roomArgTools.join(','),
  );

  const room = await call('tools/call', { name: 'vibe3d_create_room', arguments: { name: 'mcp-smoke' } });
  const roomId = json(room).roomId;
  assert(/^r_[a-z0-9]{8}$/.test(roomId ?? ''), 'create_room returns + binds room', String(roomId));

  const add = await call('tools/call', {
    name: 'vibe3d_create_node',
    arguments: {
      kind: 'mesh',
      name: 'Box',
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: [0, 0.5, 0] },
    },
  });
  assert(!add.result?.isError, 'create_node without room_id', text(add).slice(0, 160));

  const scene = await call('tools/call', { name: 'vibe3d_get_scene', arguments: {} });
  const doc = json(scene);
  const nodeNames = Object.values(doc.doc?.nodes ?? {}).map((n) => n.name);
  assert(nodeNames.includes('Box'), 'scene contains Box', nodeNames.join(','));

  const shot = await call('tools/call', { name: 'vibe3d_render_snapshot', arguments: {} });
  assert(!shot.result?.isError, 'render_snapshot ok', text(shot).slice(0, 160));

  const glb = await call('tools/call', { name: 'vibe3d_export_glb', arguments: {} });
  assert(
    !glb.result?.isError && Boolean(json(glb).jobId),
    'export_glb returns jobId',
    text(glb).slice(0, 160),
  );

  const second = await call('tools/call', {
    name: 'vibe3d_create_room',
    arguments: { name: 'mcp-smoke-2' },
  });
  const room2 = json(second).roomId;
  assert(/^r_[a-z0-9]{8}$/.test(room2 ?? '') && room2 !== roomId, 'second room binds', String(room2));

  const stale = await call('tools/call', {
    name: 'vibe3d_create_node',
    arguments: { room_id: roomId, kind: 'mesh', shape: 'box' },
  });
  assert(stale.result?.isError === true, 'stale room_id rejected', text(stale).slice(0, 160));

  const back = await call('tools/call', {
    name: 'vibe3d_get_room',
    arguments: { room_id: roomId },
  });
  const backScene = await call('tools/call', { name: 'vibe3d_get_scene', arguments: {} });
  const backNodes = Object.keys(json(backScene).doc?.nodes ?? {}).length;
  assert(
    json(back).roomId === roomId && backNodes === 1,
    'get_room switches binding back',
    `${json(back).roomId} nodes=${backNodes}`,
  );

  const bad = await call('tools/call', {
    name: 'vibe3d_create_node',
    arguments: { room_id: 'r_nope', kind: 'mesh', shape: 'box' },
  });
  assert(bad.result?.isError === true, 'unknown room_id rejected', text(bad).slice(0, 120));
} finally {
  child.kill('SIGTERM');
}

if (failures.length) {
  console.error(`smoke-mcp: ${failures.length} failed -> ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('smoke-mcp: all assertions passed');
}
