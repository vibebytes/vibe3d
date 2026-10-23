import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:18799';
const TOKEN = 'e2e-token';

async function rpc(
  path: string,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { error?: unknown; result?: Record<string, unknown> };
  if (json.error) throw new Error(`${method} -> ${JSON.stringify(json.error)}`);
  return json.result as Record<string, unknown>;
}

test('建房 → 加节点 → 拖拽 → 撤销 → 截图', async ({ page }) => {
  const room = await rpc('/rpc', 'room.create', { name: 'e2e' });
  const roomId = String(room.roomId);
  const created = await rpc(`/r/${roomId}/rpc`, 'node.create', {
    kind: 'mesh',
    shape: 'box',
    color: '#ff8800',
    name: 'box',
  });
  const nodeId = String(created.nodeId);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`/r/${roomId}?t=${TOKEN}`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500);

  const posX = async (): Promise<number> => {
    const scene = await rpc(`/r/${roomId}/rpc`, 'scene.get', {});
    const doc = scene.doc as { nodes: Record<string, { transform: { p: number[] } }> };
    return doc.nodes[nodeId]?.transform.p[0] ?? 0;
  };
  await expect.poll(posX).toBe(0);

  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('canvas 无尺寸');
  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height * 0.64);

  await page.mouse.click(cx, cy);
  await expect(page.getByRole('button', { name: /box/ }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/e2e-selected.png' });

  const grab = await page.evaluate(
    ({ cx, cy }) => {
      const tc = (window as any).__tc;
      for (let dx = 40; dx <= 140; dx += 2) {
        for (let dy = 0; dy <= 40; dy += 2) {
          for (const sign of [1, -1]) {
            const p = tc.getPointer({ clientX: cx + dx, clientY: cy + sign * dy, button: -1 });
            tc.pointerHover(p);
            if (tc.axis === 'X') return { x: cx + dx, y: cy + sign * dy };
          }
        }
      }
      return null;
    },
    { cx, cy },
  );
  if (!grab) throw new Error('未找到 X 轴手柄');
  await page.mouse.move(grab.x, grab.y, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(80);
  console.log('dragging', await page.evaluate(() => (window as any).__tc?.dragging));
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(grab.x + i * 12, grab.y);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/e2e-drag.png' });

  await expect.poll(posX, { message: '拖拽后 X 位移应大于 0.2' }).toBeGreaterThan(0.2);
  await page.screenshot({ path: 'test-results/e2e-drag.png' });

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(posX, { message: '撤销后 X 位移应回到 0' }).toBeLessThan(0.05);
  await page.screenshot({ path: 'test-results/e2e-undo.png' });

  expect(errors).toEqual([]);
});
