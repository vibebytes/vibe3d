import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:18799';
const TOKEN = 'e2e-token';

async function createRoom(): Promise<string> {
  const res = await fetch(`${BASE}/rpc`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'room.create', params: { name: 'topbar' } }),
  });
  const json = (await res.json()) as { result?: { roomId?: string } };
  return String(json.result?.roomId);
}

test('topbar adapts to page width without overflow', async ({ page }) => {
  const roomId = await createRoom();
  for (const width of [520, 700, 900, 1100, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/r/${roomId}?t=${TOKEN}`);
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    await page.waitForTimeout(600);

    const m = await header.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(m.scroll, `header overflows at ${width}px`).toBeLessThanOrEqual(m.client + 1);
    await header.screenshot({ path: `test-results/topbar-${width}.png` });
  }

  await page.setViewportSize({ width: 520, height: 800 });
  await page.goto(`/r/${roomId}?t=${TOKEN}`);
  await expect(page.getByLabel('呈现配方')).toBeHidden();
  await expect(page.getByLabel('添加几何体')).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/r/${roomId}?t=${TOKEN}`);
  await expect(page.getByLabel('呈现配方')).toBeVisible();
  await expect(page.getByLabel('添加几何体')).toBeVisible();
});
