import { describe, expect, it } from 'vitest';
import { call, makeHarness } from './helpers/harness';

function png(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return new Uint8Array(b);
}

describe('POST /r/:roomId/assets：图片资产', () => {
  it('上传 PNG 注册为 image 资产，可作为材质贴图与环境色', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: 'tex' });
    const roomId = created.body.result.roomId;

    const form = new FormData();
    form.append('file', new Blob([png(64, 32)], { type: 'image/png' }), 'checker.png');
    const res = await h.app.request(`/r/${roomId}/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${h.token}`, host: '127.0.0.1' },
      body: form,
    });
    expect(res.status).toBe(200);
    const up = (await res.json()) as any;
    expect(up.kind).toBe('image');
    expect(up.meta).toMatchObject({
      mime: 'image/png',
      kind: 'image',
      name: 'checker.png',
      image: { width: 64, height: 32, hdri: false },
    });

    const node = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box' }, roomId);
    const nodeId = node.body.result.nodeId;
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const materialId = doc.nodes[nodeId].material;

    const applied = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          {
            op: 'material.set',
            id: materialId,
            material: { ...doc.materials[materialId], map: up.sha },
          },
        ],
      },
      roomId,
    );
    expect(applied.status).toBe(200);
    const after = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(after.materials[materialId].map).toBe(up.sha);

    const env = await call(
      h,
      'ops.apply',
      {
        roomId,
        ops: [
          {
            op: 'env.set',
            env: { background: [0.1, 0.2, 0.3, 1], ambient: [1, 1, 1, 1], ambientIntensity: 0.6 },
          },
        ],
      },
      roomId,
    );
    expect(env.status).toBe(200);
    const listed = await call(h, 'asset.list', { roomId }, roomId);
    expect(listed.body.result.assets.map((a: any) => a.sha)).toContain(up.sha);
    expect(listed.body.result.refs[up.sha]).toBe(1);
  });

  it('图片扩展名与内容不符仍报 E_ASSET_FORMAT', async () => {
    const h = makeHarness();
    const created = await call(h, 'room.create', { name: 'tex' });
    const roomId = created.body.result.roomId;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), 'bad.png');
    const res = await h.app.request(`/r/${roomId}/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${h.token}`, host: '127.0.0.1' },
      body: form,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error?.data?.code ?? body.error?.code).toBe('E_ASSET_FORMAT');
  });
});
