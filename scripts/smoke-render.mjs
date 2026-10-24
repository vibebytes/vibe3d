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
let job = { jobId: exported.jobId, state: exported.state };
for (let i = 0; i < 100 && job.state !== 'done' && job.state !== 'failed'; i++) {
  await new Promise((r) => setTimeout(r, 100));
  job = await rpc('/rpc', 'job.get', { jobId: exported.jobId });
}
if (job.state !== 'done') throw new Error(`export.glb did not finish: ${JSON.stringify(job)}`);
const file = await fetch(base + job.url);
const glb = Buffer.from(await file.arrayBuffer());
const glbOk = glb.subarray(0, 4).toString('utf8') === 'glTF';

const tampered = await fetch(`${base}${job.url.split('&')[0]}&sig=${'0'.repeat(32)}`);

const checks = {
  healthOk: health.ok === true,
  snapshotPng: pngOk,
  snapshotSize: shot.width === 640 && shot.height === 360,
  editorUrl: typeof opened.url === 'string' && opened.url.includes(`/editor/r/${roomId}`),
  exportDone: job.state === 'done',
  exportHttp: file.status === 200,
  exportGlb: glbOk,
  tamperedRejected: tampered.status === 401 || tampered.status === 403,
};

const failed = Object.entries(checks)
  .filter(([, v]) => !v)
  .map(([k]) => k);

console.log(
  JSON.stringify({
    roomId,
    snapshot: { mime: shot.mime, bytes: png.length, pngOk, width: shot.width, height: shot.height },
    editorUrl: opened.url,
    export: { jobId: exported.jobId, bytes: glb.length, glbOk, status: file.status },
    tamperedStatus: tampered.status,
    checks,
    failed,
  }),
);

if (failed.length > 0) {
  console.error(`smoke-render FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
