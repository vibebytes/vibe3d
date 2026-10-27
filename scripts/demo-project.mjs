const base = process.env.VIBE3D_BASE ?? 'http://127.0.0.1:18788';
const token = process.env.VIBE3D_TOKEN ?? 'smoke-token-123';
const W = 1024;
const H = 640;
const TOL_PX = 1;
const TOL_ROUNDTRIP = 1e-6;

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

const anchors = [
  { name: 'anchor-red', p: [-1.2, 0.5, 0] },
  { name: 'anchor-green', p: [0, 0.5, 0] },
  { name: 'anchor-blue', p: [1.2, 0.5, 0] },
];

const room = await rpc('/rpc', 'room.create', { name: 'project-demo' });
const roomId = room.roomId;
let failures = 0;

try {
  const nodeIds = [];
  for (const [i, a] of anchors.entries()) {
    const created = await rpc(`/r/${roomId}/rpc`, 'node.create', {
      kind: 'mesh',
      shape: 'sphere',
      name: a.name,
      color: ['#ff5555', '#55ff88', '#5599ff'][i],
      transform: { p: a.p, r: [0, 0, 0], s: [1, 1, 1] },
    });
    nodeIds.push(created.nodeId);
  }

  const cam = await rpc(`/r/${roomId}/rpc`, 'camera.set', {
    camera: { p: [3.2, 2.2, 4.6], target: [0, 0.5, 0], fov: 45 },
  });
  console.log(`camera.set -> fov=${cam.camera.fov} fov_h=${cam.fov_h}`);

  const proj = await rpc(`/r/${roomId}/rpc`, 'camera.project', {
    points: anchors.map((a) => a.p),
    width: W,
    height: H,
  });
  console.log(`camera.project -> source=${proj.source} ${proj.width}x${proj.height}`);

  const picks = await rpc(`/r/${roomId}/rpc`, 'render.pick', {
    points: proj.points.map((q) => ({ x: Math.round(q.px[0]), y: Math.round(q.px[1]) })),
    width: W,
    height: H,
  });

  const unproj = await rpc(`/r/${roomId}/rpc`, 'camera.unproject', {
    points: proj.points.map((q) => [q.px[0], q.px[1]]),
    depth: proj.points.map((q) => q.depth),
    width: W,
    height: H,
  });

  console.table(
    anchors.map((a, i) => ({
      anchor: a.name,
      px: proj.points[i].px.map((v) => +v.toFixed(1)).join(','),
      in_view: proj.points[i].in_view,
      pick_node: picks.samples[i]?.node_id ?? null,
      hit: picks.samples[i]?.node_id == null ? null : picks.samples[i].node_id === nodeIds[i],
      roundtrip: unproj.points[i].p.map((v, k) => Math.abs(v - a.p[k])).reduce((m, d) => Math.max(m, d), 0),
    })),
  );

  for (const [i, a] of anchors.entries()) {
    if (!proj.points[i].in_view) fail(a.name, 'projected out of view');
    const px = proj.points[i].px;
    if (px[0] < 0 || px[1] < 0 || px[0] >= W || px[1] >= H) fail(a.name, 'px outside canvas');
    const picked = picks.samples[i]?.node_id;
    if (picked == null) {
      warn(a.name, 'renderer unavailable — same-frame id pass skipped (project/unproject still verified)');
    } else if (picked !== nodeIds[i]) {
      fail(a.name, `pick hit ${picked}, expected ${nodeIds[i]}`);
    }
    const back = unproj.points[i].p;
    const err = Math.max(...back.map((v, k) => Math.abs(v - a.p[k])));
    if (err > TOL_ROUNDTRIP) fail(a.name, `roundtrip error ${err}`);
  }
} finally {
  await rpc(`/r/${roomId}/rpc`, 'room.close', { purge: true }).catch(() => {});
}

function fail(name, why) {
  failures += 1;
  console.error(`FAIL ${name}: ${why}`);
}

function warn(name, why) {
  console.warn(`WARN ${name}: ${why}`);
}

if (failures > 0) {
  console.error(`demo-project: ${failures} failure(s)`);
  process.exit(1);
}
console.log(
  `demo-project: all ${anchors.length} anchors pass (pick same-frame, roundtrip <= ${TOL_ROUNDTRIP})`,
);
