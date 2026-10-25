import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';
import { makePng } from './helpers/png';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'HDRI 宽松类型' });
  return body.result.roomId;
}

function tmpFile(name: string, bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'v3d-hdri-img-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

const panoPng = (): string => tmpFile('pano.png', makePng(64, 32, (x, y) => (x + y) % 2 === 0 ? [40, 60, 90, 255] : [10, 20, 30, 255]));

const jpegBytes = (w: number, h: number): Buffer => {
  const b = Buffer.alloc(21);
  b.writeUInt16BE(0xffd8, 0);
  b.writeUInt16BE(0xffc0, 2);
  b.writeUInt16BE(17, 4);
  b[6] = 8;
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  b[11] = 3;
  return b;
};
const panoJpg = (): string => tmpFile('pano.jpg', jpegBytes(64, 32));

describe('等距柱状 png/jpg 作为 HDRI', () => {
  it('asset.put kind=hdri 接受 png 并标记 hdri', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'asset.put', { roomId, src: panoPng(), kind: 'hdri' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.meta.image).toMatchObject({ hdri: true });
    expect(body.result.meta.kind).toBe('image');
  });

  it('env.set hdriSrc 接受 png 全景并生效', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'env.set', { roomId, hdriSrc: panoPng() }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.env.hdri).toBe(body.result.sha);

    const { body: doc } = await call(h, 'scene.get', { roomId }, roomId);
    expect(doc.result.doc.env.hdri).toBe(body.result.sha);
  });

  it('auto 分类下 png 仍是普通贴图', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'asset.put', { roomId, src: panoPng() }, roomId);
    expect(body.result.meta.image).toMatchObject({ hdri: false });
  });

  it('kind=hdri 之外的 jpg 走普通贴图，不会被误标', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'asset.put', { roomId, src: panoJpg(), kind: 'image' }, roomId);
    expect(codeOf(body)).toBeUndefined();
    expect(body.result.meta.image.hdri).toBe(false);
  });
});
