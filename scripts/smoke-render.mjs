const base = process.env.VIBE3D_BASE ?? 'http://127.0.0.1:18788';
const token = process.env.VIBE3D_TOKEN ?? 'smoke-token-123';

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

const health = await (await fetch(`${base}/health`)).json();
const room = await rpc('/rpc', 'room.create', { name: 'render-smoke' });
const roomId = room.roomId;

await rpc(`/r/${roomId}/rpc`, 'node.create', { kind: 'mesh', shape: 'box', name: 'box', color: '#ff8800' });
await rpc(`/r/${roomId}/rpc`, 'node.create', {
  kind: 'light',
  name: 'key',
  light: { type: 'point', color: [1, 1, 1, 1], intensity: 12, position: [2, 3, 2] },
});

const shot = await rpc(`/r/${roomId}/rpc`, 'render.snapshot', { width: 640, height: 360 });
const png = Buffer.from(shot.base64, 'base64');
const pngOk = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const opened = await rpc(`/r/${roomId}/rpc`, 'editor.open', {});

const exported = await rpc(`/r/${roomId}/rpc`, 'export.glb', {});
const file = await fetch(base + exported.url);
const glb = Buffer.from(await file.arrayBuffer());
const glbOk = glb.subarray(0, 4).toString('utf8') === 'glTF';

const tampered = await fetch(`${base}${exported.url.split('&')[0]}&sig=${'0'.repeat(32)}`);

console.log(
  JSON.stringify({
    health,
    roomId,
    snapshot: { mime: shot.mime, bytes: png.length, pngOk, width: shot.width, height: shot.height },
    editorUrl: opened.url,
    export: { jobId: exported.jobId, bytes: glb.length, glbOk, status: file.status },
    tamperedStatus: tampered.status,
  }),
);
