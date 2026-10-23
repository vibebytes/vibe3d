import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glb } from './helpers/glb';
import { call, makeHarness, post } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

describe('http: rpc 信封', () => {
  it('health 暴露版本、房间数与渲染器', async () => {
    const h = makeHarness();
    const res = await h.app.request('/health', { headers: { host: '127.0.0.1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rooms: 0, renderer: 'none' });
  });

  it('hello 返回能力清单', async () => {
    const h = makeHarness();
    const { status, body } = await call(h, 'hello');
    expect(status).toBe(200);
    expect(body.result.capabilities).toContain('room.create');
    expect(body.result.capabilities).toContain('render.snapshot');
  });

  it('缺少或错误 Bearer 被拒', async () => {
    const h = makeHarness();
    const none = await post(h, '/rpc', { method: 'hello' }, { token: null });
    expect(none.status).toBe(401);
    const wrong = await post(h, '/rpc', { method: 'hello' }, { token: 'nope' });
    expect(wrong.status).toBe(401);
  });

  it('拒绝非本机 Host', async () => {
    const h = makeHarness();
    const res = await post(h, '/rpc', { method: 'hello' }, { headers: { host: 'evil.example:8080' } });
    expect(res.status).toBe(401);
    expect(codeOf(await res.json())).toBe('E_UNAUTHORIZED');
  });

  it('信封校验：非 JSON / 数组 / jsonrpc / id / method', async () => {
    const h = makeHarness();
    const cases: [unknown, string][] = [
      ['not json', 'E_PARSE'],
      [[1, 2], 'E_INVALID_REQUEST'],
      [{ jsonrpc: '1.0', method: 'hello' }, 'E_INVALID_REQUEST'],
      [{ id: { x: 1 }, method: 'hello' }, 'E_INVALID_REQUEST'],
      [{ id: 1 }, 'E_INVALID_REQUEST'],
    ];
    for (const [body, code] of cases) {
      const res = await post(h, '/rpc', body as any);
      expect(codeOf(await res.json()), code).toBe(code);
    }
  });

  it('未知方法与参数非法', async () => {
    const h = makeHarness();
    const unknown = await call(h, 'nope.nope');
    expect(codeOf(unknown.body)).toBe('E_NO_METHOD');
    const bad = await call(h, 'room.create', { name: '' });
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
    expect(bad.body.error.data.issues[0].path).toBe('name');
  });

  it('控制面/数据面 scope 隔离', async () => {
    const h = makeHarness();
    const room = await call(h, 'room.create', { name: 'demo' });
    const roomId = room.body.result.roomId;
    expect((await call(h, 'room.get', { roomId })).body.error.data.code).toBe('E_NO_METHOD');
    expect((await call(h, 'room.list', {}, roomId)).body.error.data.code).toBe('E_NO_METHOD');
  });

  it('创建、列出、读取、关闭房间', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: '展厅', template: 'empty' });
    expect(created.status).toBe(200);
    const roomId = created.body.result.roomId;
    expect(created.body.result.url).toMatch(new RegExp(`/r/${roomId}$`));
    expect(created.body.result.name).toBe('展厅');

    const listed = await call(h, 'room.list');
    expect(listed.body.result.rooms).toHaveLength(1);
    expect(listed.body.result.rooms[0].nodeCount).toBe(0);

    const got = await call(h, 'room.get', { roomId }, roomId);
    expect(got.body.result.revision).toBe(0);

    const closed = await call(h, 'room.close', { roomId }, roomId);
    expect(closed.body.result).toMatchObject({ closed: true, revision: 0 });
    const after = await call(h, 'room.get', { roomId }, roomId);
    expect(codeOf(after.body)).toBe('E_ROOM_NOT_FOUND');
  });

  it('content-length 超限返回 413', async () => {
    const h = makeHarness();
    const res = await post(
      h,
      '/rpc',
      { method: 'hello' },
      { headers: { 'content-length': String(9 * 1024 * 1024) } },
    );
    expect(res.status).toBe(413);
    expect(codeOf(await res.json())).toBe('E_PAYLOAD_TOO_LARGE');
  });

  it('未知路由返回 404 信封', async () => {
    const h = makeHarness();
    const res = await h.app.request('/nope', { headers: { host: '127.0.0.1' } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('E_NO_METHOD');
  });
});

describe('http: 资产与导出', () => {
  it('multipart 上传 GLB 后可按 sha 下载', async () => {
    const h = makeHarness();
    const roomId = (await call(h, 'room.create')).body.result.roomId;
    const json = Buffer.from(
      JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }),
    );
    const pad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + json.length + pad.length, 8);
    header.writeUInt32LE(json.length + pad.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const glb = Buffer.concat([header, json, pad]);
    const form = new FormData();
    form.set('file', new Blob([glb], { type: 'model/gltf-binary' }), 'cube.glb');
    const up = await h.app.request(`/r/${roomId}/assets`, {
      method: 'POST',
      headers: { host: '127.0.0.1', authorization: `Bearer ${h.token}` },
      body: form,
    });
    expect(up.status).toBe(200);
    const uploaded = (await up.json()) as { kind: string; sha: string };
    expect(uploaded.kind).toBe('gltf');
    expect(uploaded.sha).toMatch(/^[a-f0-9]{64}$/);

    const dl = await h.app.request(`/assets/${uploaded.sha}`, { headers: { host: '127.0.0.1' } });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer()).length).toBe(glb.length);

    const bad = await h.app.request('/assets/not-a-sha', { headers: { host: '127.0.0.1' } });
    expect(codeOf(await bad.json())).toBe('E_ASSET_MISSING');
    const missing = await h.app.request(`/assets/${'a'.repeat(64)}`, { headers: { host: '127.0.0.1' } });
    expect(codeOf(await missing.json())).toBe('E_ASSET_MISSING');
  });

  it('上传缺少 file 字段时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = (await call(h, 'room.create')).body.result.roomId;
    const form = new FormData();
    form.set('other', 'x');
    const res = await h.app.request(`/r/${roomId}/assets`, {
      method: 'POST',
      headers: { host: '127.0.0.1', authorization: `Bearer ${h.token}` },
      body: form,
    });
    expect(codeOf(await res.json())).toBe('E_INVALID_PARAMS');
  });

  it('上传扩展名、MIME 与内容不符时给明确错误码', async () => {
    const h = makeHarness();
    const roomId = (await call(h, 'room.create')).body.result.roomId;
    const up = (filename: string, type: string, body: Uint8Array) => {
      const form = new FormData();
      form.set('file', new Blob([body], { type }), filename);
      return h.app.request(`/r/${roomId}/assets`, {
        method: 'POST',
        headers: { host: '127.0.0.1', authorization: `Bearer ${h.token}` },
        body: form,
      });
    };

    const txt = await up('notes.txt', 'text/plain', Buffer.from('hi'));
    expect(txt.status).toBe(415);
    const txtBody = (await txt.json()) as { error: { data: { code: string; allowed: string[] } } };
    expect(codeOf(txtBody)).toBe('E_ASSET_TYPE');
    expect(txtBody.error.data.allowed).toEqual(['.glb', '.gltf']);

    const mime = await up('cube.glb', 'text/plain', glb());
    expect(mime.status).toBe(415);
    expect(codeOf(await mime.json())).toBe('E_ASSET_TYPE');

    const fake = await up('fake.glb', 'model/gltf-binary', Buffer.from('not a glb'));
    expect(fake.status).toBe(422);
    expect(codeOf(await fake.json())).toBe('E_ASSET_FORMAT');

    const ok = await up('cube.glb', 'application/octet-stream', glb());
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { kind: string };
    expect(okBody.kind).toBe('gltf');
  });

  it('签名导出链接校验过期、签名与文件名', async () => {
    const h = makeHarness();
    const jobId = 'f'.repeat(32);
    const file = `${jobId}.glb`;
    writeFileSync(join(h.dirs.exports, file), Buffer.from('glTF'));
    const sign = (exp: number): string =>
      createHmac('sha256', h.token).update(`${jobId}:${exp}`).digest('hex').slice(0, 32);

    const exp = Date.now() + 60_000;
    const ok = await h.app.request(`/exports/${file}?exp=${exp}&sig=${sign(exp)}`, {
      headers: { host: '127.0.0.1' },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toContain(jobId);

    const expired = await h.app.request(
      `/exports/${file}?exp=${Date.now() - 1}&sig=${sign(Date.now() - 1)}`,
      {
        headers: { host: '127.0.0.1' },
      },
    );
    expect(codeOf(await expired.json())).toBe('E_UNAUTHORIZED');

    const badSig = await h.app.request(`/exports/${file}?exp=${exp}&sig=${'0'.repeat(32)}`, {
      headers: { host: '127.0.0.1' },
    });
    expect(codeOf(await badSig.json())).toBe('E_UNAUTHORIZED');

    const badName = await h.app.request(`/exports/evil.glb?exp=${exp}&sig=${sign(exp)}`, {
      headers: { host: '127.0.0.1' },
    });
    expect(codeOf(await badName.json())).toBe('E_JOB_NOT_FOUND');

    const signed = `${'a'.repeat(32)}.glb`;
    const signedExp = Date.now() + 60_000;
    const signedSig = createHmac('sha256', h.token)
      .update(`${'a'.repeat(32)}:${signedExp}`)
      .digest('hex')
      .slice(0, 32);
    const gone = await h.app.request(`/exports/${signed}?exp=${signedExp}&sig=${signedSig}`, {
      headers: { host: '127.0.0.1' },
    });
    expect(codeOf(await gone.json())).toBe('E_JOB_NOT_FOUND');
  });
});
