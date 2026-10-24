import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glb } from './helpers/glb';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function tmpFile(name: string, bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'v3d-model-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '模型通道' });
  return body.result.roomId;
}

function pngBytes(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.writeUInt32BE(4, 16);
  b.writeUInt32BE(4, 20);
  return b;
}

describe('asset.put model channel', () => {
  it('registers a glb as a model asset with its report', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpFile('chair.glb', glb({ min: [0, 0, 0], max: [1, 2, 1] }));
    const { body } = await call(h, 'asset.put', { roomId, src, kind: 'model' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.meta.kind).toBe('gltf');
    expect(body.result.meta.gltf?.version).toBe('2.0');
    const got = await call(h, 'scene.get', { roomId }, roomId);
    expect(got.body.result.doc.assets[body.result.sha]).toBeTruthy();
  });

  it('reuses the registered model through node.import{sha} without a second blob', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const src = tmpFile('chair.glb', glb());
    const put = await call(h, 'asset.put', { roomId, src, kind: 'model' }, roomId);
    const sha = put.body.result.sha;
    const first = await call(h, 'node.import', { roomId, sha }, roomId);
    const second = await call(h, 'node.import', { roomId, sha }, roomId);
    expect(codeOf(first.body)).toBeUndefined();
    expect(second.body.result.sha).toBe(sha);
    expect(first.body.result.nodeId).not.toBe(second.body.result.nodeId);
    const list = await call(h, 'asset.list', { roomId }, roomId);
    expect(list.body.result.assets).toHaveLength(1);
    expect(list.body.result.usedBy[sha].sort()).toEqual(
      [first.body.result.nodeId, second.body.result.nodeId].sort(),
    );
  });

  it('rejects kind=model for an image', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const png = pngBytes();
    const src = tmpFile('tex.png', png);
    const { body } = await call(h, 'asset.put', { roomId, src, kind: 'model' }, roomId);
    expect(codeOf(body)).toBe('E_ASSET_TYPE');
  });

  it('rejects a model larger than 50 MB', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
    big.writeUInt32LE(0x46546c67, 0);
    big.writeUInt32LE(2, 4);
    const src = tmpFile('huge.glb', big);
    const { body } = await call(h, 'asset.put', { roomId, src, kind: 'model' }, roomId);
    expect(codeOf(body)).toBe('E_PAYLOAD_TOO_LARGE');
  });

  it('lists env hdri references under usedBy as "env"', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const hdr = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n', 'ascii');
    const put = await call(h, 'asset.put', { roomId, src: tmpFile('sky.hdr', hdr) }, roomId);
    await call(h, 'env.set', { roomId, hdriSrc: tmpFile('sky.hdr', hdr) }, roomId);
    const list = await call(h, 'asset.list', { roomId }, roomId);
    expect(list.body.result.usedBy[put.body.result.sha]).toContain('env');
  });
});
