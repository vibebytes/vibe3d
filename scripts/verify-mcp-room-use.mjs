import { spawn } from 'node:child_process';
import readline from 'node:readline';

const child = spawn(process.execPath, ['packages/mcp/dist/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, VIBE3D_HOME: `${process.cwd()}/.devhome` },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const pending = new Map();
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.log('RAW', line.slice(0, 200));
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.id === undefined) {
    console.log('NOTIFY', JSON.stringify(msg).slice(0, 160));
  }
});
child.stderr.on('data', (chunk) => console.log('STDERR', String(chunk).slice(0, 240)));

let seq = 0;
const req = (method, params) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

const init = await req('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'verify', version: '0' },
});
console.log('init ok', Boolean(init.result));
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

const list = await req('tools/list', {});
const tools = list.result.tools;
const use = tools.find((t) => t.name === 'vibe3d_use_room');
console.log('tools', tools.length);
console.log('use_room annotations', JSON.stringify(use.annotations));
console.log('use_room required', JSON.stringify(use.inputSchema.required ?? []));

const called = await req('tools/call', { name: 'vibe3d_use_room', arguments: { roomId: 'r_jjpde471' } });
console.log('use_room isError', Boolean(called.result.isError), JSON.stringify(called.result).slice(0, 320));

const got = await req('tools/call', { name: 'vibe3d_get_room', arguments: {} });
console.log('get_room isError', Boolean(got.result.isError), JSON.stringify(got.result).slice(0, 320));

const noArg = await req('tools/call', { name: 'vibe3d_use_room', arguments: {} });
console.log(
  'use_room(no arg) isError',
  Boolean(noArg.result.isError),
  JSON.stringify(noArg.result).slice(0, 240),
);

child.kill();
