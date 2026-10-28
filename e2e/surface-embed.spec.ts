import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:18799';
const TOKEN = 'e2e-token';

async function rpc(path: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { error?: unknown; result?: Record<string, unknown> };
  if (json.error) throw new Error(`${method} -> ${JSON.stringify(json.error)}`);
  return json.result as Record<string, unknown>;
}

/**
 * The host mints its own bearer for panel tool calls. That bearer is NOT the daemon bearer, so the
 * page must keep using the `?t=` token for `/rpc` and the room socket. This test drives the real
 * handshake with a bogus host token, then forces traffic *after* the grant lands: a stale token
 * would 401 the RPC and 404 the socket.
 */
test('嵌入握手后 RPC 与 WS 仍用 daemon token（host token 不覆盖）', async ({ page }) => {
  const room = await rpc('/rpc', 'room.create', { name: 'surface' });
  const roomId = String(room.roomId);
  await rpc(`/r/${roomId}/rpc`, 'node.create', { kind: 'mesh', shape: 'box', name: 'box' });

  const rpcAuth: string[] = [];
  const wsUrls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rpc') && req.method() === 'POST') {
      rpcAuth.push(req.headers()['authorization'] ?? '');
    }
  });
  page.on('websocket', (ws) => wsUrls.push(ws.url()));

  await page.route(`${BASE}/__host`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0">
<iframe id="f" src="${BASE}/r/${roomId}?t=${TOKEN}" style="width:1200px;height:760px;border:0"></iframe>
<script>
  const f = document.getElementById('f');
  window.__seen = [];
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    window.__seen.push(d.kind);
    if (d.kind === 'surface.ready') {
      f.contentWindow.postMessage({kind:'host.ready', surfaceId:'vibe3d.editor', instanceKey:'k1', theme:'dark', size:{width:1200,height:760}}, '*');
      f.contentWindow.postMessage({kind:'host.token', token:'HOST-ONLY-TOKEN', toolScope:['tool.call']}, '*');
    }
  });
</script></body></html>`,
    }),
  );

  await page.goto(`${BASE}/__host`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen))
    .toContain('surface.ready');

  const frame = page.frameLocator('#f');
  await expect(frame.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

  // Traffic after the grant: the socket must (re)connect with the daemon token, and a fresh RPC
  // issued from inside the frame must still authenticate.
  await expect.poll(() => wsUrls.length, { timeout: 30_000 }).toBeGreaterThan(0);
  for (const url of wsUrls) expect(url).toContain(`t=${TOKEN}`);

  const before = rpcAuth.length;
  await rpc(`/r/${roomId}/rpc`, 'node.create', { kind: 'mesh', shape: 'sphere', name: 'probe' });
  await expect.poll(() => rpcAuth.length, { timeout: 30_000 }).toBeGreaterThan(before);

  for (const auth of rpcAuth) {
    expect(auth).toBe(`Bearer ${TOKEN}`);
    expect(auth).not.toContain('HOST-ONLY-TOKEN');
  }
});
