import { request as httpRequest } from 'node:http';
import WebSocket from 'ws';

const base = process.env.VIBE3D_BASE ?? 'http://127.0.0.1:18788';
const token = process.env.VIBE3D_TOKEN ?? 'smoke-token-123';
const wsBase = base.replace(/^http/, 'ws');

async function rpc(path, method, params) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} -> ${JSON.stringify(json.error)}`);
  return json.result;
}

const room = await rpc('/rpc', 'room.create', { name: 'smoke' });
const roomId = room.roomId;
const before = await rpc(`/r/${roomId}/rpc`, 'scene.get', {});
const created = await rpc(`/r/${roomId}/rpc`, 'node.create', {
  kind: 'mesh',
  shape: 'box',
  name: 'box1',
  color: '#ff8800',
});
const after = await rpc(`/r/${roomId}/rpc`, 'scene.get', {});
const summary = await rpc(`/r/${roomId}/rpc`, 'scene.summary', {});
console.log(
  JSON.stringify({
    roomId,
    url: room.url,
    beforeRevision: before.revision,
    nodeId: created.nodeId,
    afterRevision: after.revision,
    nodes: Object.keys(after.doc.nodes).length,
    nodeCount: summary.nodeCount,
  }),
);

const ws = new WebSocket(`${wsBase}/r/${roomId}/ws?t=${token}`);
const frames = [];
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`ws timeout ${JSON.stringify(frames)}`)), 5000);
  ws.on('message', (data) => {
    frames.push(JSON.parse(data.toString()));
    if (frames.some((f) => f.type === 'hello') && frames.some((f) => f.event === 'scene.changed')) {
      clearTimeout(timer);
      resolve();
    }
  });
  ws.on('error', reject);
});
await new Promise((resolve, reject) => {
  ws.on('open', resolve);
  ws.on('error', reject);
});
await rpc(`/r/${roomId}/rpc`, 'node.create', {
  kind: 'mesh',
  shape: 'sphere',
  name: 'sphere1',
  color: '#00aaff',
});
await done;
console.log(JSON.stringify({ wsFrames: frames }));
ws.close();

const denied = await new Promise((resolve, reject) => {
  const req = httpRequest(
    { host: '127.0.0.1', port: new URL(base).port, path: '/health', headers: { host: 'evil.example' } },
    (res) => resolve(res.statusCode),
  );
  req.on('error', reject);
  req.end();
});
console.log(JSON.stringify({ hostGuardStatus: denied }));
