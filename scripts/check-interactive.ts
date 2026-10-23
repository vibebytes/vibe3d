import { writeFile } from 'node:fs/promises';
import { Cdp } from '../packages/daemon/src/render/cdp';
import { findChrome, launchChrome } from '../packages/daemon/src/render/chrome';

const base = process.env.VIBE3D_BASE ?? 'http://127.0.0.1:18788';
const token = process.env.VIBE3D_TOKEN ?? 'smoke-token-123';

async function rpc(path: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { error?: unknown; result?: unknown };
  if (json.error) throw new Error(`${method} -> ${JSON.stringify(json.error)}`);
  return json.result as Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const room = await rpc('/rpc', 'room.create', { name: 'interactive-check' });
const roomId = room.roomId as string;
await rpc(`/r/${roomId}/rpc`, 'node.create', { kind: 'mesh', shape: 'box', name: 'box', color: '#ff8800' });
await rpc(`/r/${roomId}/rpc`, 'node.create', {
  kind: 'light',
  name: 'key',
  light: { type: 'point', color: [1, 1, 1, 1], intensity: 12, position: [2, 3, 2] },
});

const exe = findChrome();
if (!exe) throw new Error('Chrome 未找到');
const chrome = await launchChrome(exe, { noSandbox: true });
const cdp = await Cdp.connect(chrome.wsUrl);
const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
  targetId,
  flatten: true,
});
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);

const errors: string[] = [];
cdp.on('Runtime.exceptionThrown', (p, sid) => {
  if (sid !== sessionId) return;
  const d = p.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
  errors.push((d?.exception?.description ?? d?.text ?? 'exception').slice(0, 300));
});
cdp.on('Runtime.consoleAPICalled', (p, sid) => {
  if (sid !== sessionId || p.type !== 'error') return;
  const args = (p.args as { value?: unknown; description?: string }[] | undefined) ?? [];
  errors.push(
    args
      .map((a) => a.value ?? a.description ?? '')
      .join(' ')
      .slice(0, 300),
  );
});

const evalJs = async (expression: string) => {
  const res = await cdp.send<{ result: { value?: unknown } }>(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  return res.result.value;
};

const shot = async (file: string) => {
  const res = await cdp.send<{ data: string }>(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true },
    sessionId,
  );
  const buf = Buffer.from(res.data, 'base64');
  await writeFile(file, buf);
  return buf.length;
};

await cdp.send(
  'Emulation.setDeviceMetricsOverride',
  { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  sessionId,
);
await cdp.send(
  'Page.navigate',
  { url: `${base}/r/${roomId}?t=${encodeURIComponent(token)}` },
  sessionId,
  25_000,
);

let ready = false;
for (let i = 0; i < 100; i++) {
  const ok = await evalJs("!!document.querySelector('canvas') && document.querySelector('canvas').width > 0");
  if (ok) {
    ready = true;
    break;
  }
  await sleep(200);
}
await sleep(1200);
const before = await shot('/tmp/t04-before.png');

const box = (await evalJs(
  "JSON.stringify((document.querySelector('canvas') ?? document.body).getBoundingClientRect())",
)) as string;
const rect = JSON.parse(box) as { x: number; y: number; width: number; height: number };
const cx = Math.round(rect.x + rect.width / 2);
const cy = Math.round(rect.y + rect.height * 0.64);
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
  await cdp.send(
    'Input.dispatchMouseEvent',
    { type, x: cx, y: cy, button: 'left', clickCount: 1 },
    sessionId,
  );
  await sleep(60);
}
await sleep(900);
const afterPick = await shot('/tmp/t04-after-pick.png');

const clicked = await evalJs(
  "(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim().startsWith('◆') && el.textContent.includes('box')); if (!b) return false; b.click(); return true; })()",
);
await sleep(900);
const afterTree = await shot('/tmp/t04-after-tree.png');

await cdp.send('Target.closeTarget', { targetId });
cdp.close();
await chrome.close();

console.log(
  JSON.stringify({
    roomId,
    ready,
    rect,
    bytes: { before, afterPick, afterTree },
    pickChanged: before !== afterPick,
    treeClicked: clicked,
    treeChanged: afterPick !== afterTree,
    errors: errors.slice(0, 8),
    errorCount: errors.length,
  }),
);
