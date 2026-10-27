import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeHarness, post, call, type Harness } from './helpers/harness';

async function roomIdOf(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '无鉴权' });
  return body.result.roomId;
}

describe('无 token daemon（默认鉴权关闭）', () => {
  it('POST /rpc 不带 Authorization 直接放行', async () => {
    const h = makeHarness({ token: null });
    const res = await post(h, '/rpc', {}, { token: null });
    expect(res.status).not.toBe(401);
  });

  it('editor surface 无 cookie 无 query 直接放行', async () => {
    const h = makeHarness({ token: null });
    const roomId = await roomIdOf(h);
    const res = await h.app.request(`/r/${roomId}`);
    expect(res.status).not.toBe(401);
  });

  it('/exports 无签名直接放行', async () => {
    const h = makeHarness({ token: null });
    const file = `${'ab'.repeat(16)}.glb`;
    writeFileSync(join(h.dirs.exports, file), 'glb-bytes');
    const res = await h.app.request(`/exports/${file}`);
    expect(res.status).not.toBe(401);
  });
});

describe('带 token daemon（显式 opt-in 仍强制鉴权）', () => {
  it('POST /rpc 不带 Authorization 仍 401', async () => {
    const h = makeHarness();
    const res = await post(h, '/rpc', {}, { token: null });
    expect(res.status).toBe(401);
  });

  it('editor surface 无 cookie 无 query 仍 401', async () => {
    const h = makeHarness();
    const roomId = await roomIdOf(h);
    const res = await h.app.request(`/r/${roomId}`);
    expect(res.status).toBe(401);
  });
});
