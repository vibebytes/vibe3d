import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/mcp/package.json', import.meta.url));
const { Client } = await import(require.resolve('@modelcontextprotocol/client'));
const { StdioClientTransport } = await import(require.resolve('@modelcontextprotocol/client/stdio'));
const serverBin = new URL('../packages/mcp/dist/index.js', import.meta.url).pathname;

const spec = JSON.parse(
  readFileSync(new URL('../packages/capabilities/generated/spec.json', import.meta.url), 'utf8'),
);
const declared = spec.capabilities.filter((c) => c.mcp?.tool);
const declaredTools = [...new Set(declared.map((c) => c.mcp.tool))];

const url = process.env.VIBE3D_URL ?? 'http://127.0.0.1:18790';
const token = process.env.VIBE3D_TOKEN ?? 'testtoken123456';
const root = new URL('..', import.meta.url).pathname;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverBin, '--url', url, '--autostart', 'false'],
  cwd: root,
  env: { ...process.env, VIBE3D_URL: url, VIBE3D_TOKEN: token },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0' });

const text = (result) => result.content?.find((block) => block.type === 'text')?.text ?? '';
const json = (result) => {
  try {
    return JSON.parse(text(result));
  } catch {
    return text(result);
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

const call = (name, args) => client.callTool({ name, arguments: args });

try {
  await client.connect(transport);
  console.log('initialize', client.getServerVersion()?.name);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  assert(names.includes('vibe3d_help'), 'help tool is advertised');
  assert(
    declaredTools.every((name) => names.includes(name)) && names.length === declaredTools.length + 1,
    `tools/list == ${declaredTools.length} grouped tools + help`,
    `got ${names.length}`,
  );
  const expectedRoomArg = [...new Set(declared.filter((c) => c.mcp.roomArg).map((c) => c.mcp.tool))].sort();
  const roomArgTools = listed.tools
    .filter((tool) => tool.inputSchema?.properties?.room_id)
    .map((tool) => tool.name)
    .sort();
  assert(
    expectedRoomArg.every((name) => roomArgTools.includes(name)),
    `room_id present on ${expectedRoomArg.join(', ')}`,
    roomArgTools.join(','),
  );

  const room = await call('vibe3d_room', { op: 'create', name: 'mcp-smoke' });
  const roomId = json(room).roomId;
  assert(/^r_[a-z0-9]{8}$/.test(roomId ?? ''), 'create_room returns + binds room', String(roomId));

  const add = await call('vibe3d_node', {
    op: 'create',
    node: { kind: 'mesh', name: 'Box', shape: 'box', size: [1, 1, 1], transform: { p: [0, 0.5, 0] } },
  });
  assert(!add.isError, 'create_node without room_id', text(add).slice(0, 160));

  const scene = await call('vibe3d_scene', { op: 'get' });
  const doc = json(scene);
  const nodeNames = Object.values(doc.doc?.nodes ?? {}).map((n) => n.name);
  assert(nodeNames.includes('Box'), 'scene contains Box', nodeNames.join(','));

  const shot = await call('vibe3d_render', { op: 'snapshot' });
  assert(!shot.isError, 'render_snapshot ok', text(shot).slice(0, 160));

  const glb = await call('vibe3d_export_glb', { op: 'glb' });
  if (json(glb).code === 'E_RENDER_UNAVAILABLE') {
    console.log('skip export_glb: no editor page is connected');
  } else {
    assert(!glb.isError && Boolean(json(glb).jobId), 'export_glb returns jobId', text(glb).slice(0, 160));
  }

  const second = await call('vibe3d_room', { op: 'create', name: 'mcp-smoke-2' });
  const room2 = json(second).roomId;
  assert(/^r_[a-z0-9]{8}$/.test(room2 ?? '') && room2 !== roomId, 'second room binds', String(room2));

  const stale = await call('vibe3d_node', {
    op: 'create',
    room_id: roomId,
    node: { kind: 'mesh', shape: 'box' },
  });
  assert(stale.isError === true, 'stale room_id rejected', text(stale).slice(0, 160));

  const missing = await call('vibe3d_room', { op: 'use' });
  assert(missing.isError === true, 'use_room without room_id rejected', text(missing).slice(0, 120));

  const back = await call('vibe3d_room', { op: 'use', room_id: roomId });
  const backScene = await call('vibe3d_scene', { op: 'get' });
  const backNodes = Object.keys(json(backScene).doc?.nodes ?? {}).length;
  assert(
    json(back).roomId === roomId && backNodes === 1,
    'use_room switches binding back',
    `${json(back).roomId} nodes=${backNodes}`,
  );

  const bad = await call('vibe3d_node', {
    op: 'create',
    room_id: 'r_nope',
    node: { kind: 'mesh', shape: 'box' },
  });
  assert(bad.isError === true, 'unknown room_id rejected', text(bad).slice(0, 120));
} finally {
  await client.close().catch(() => undefined);
}

if (failures.length) {
  console.error(`smoke-mcp: ${failures.length} failed -> ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('smoke-mcp: all assertions passed');
}
