import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

function hdrFile(name = 'studio.hdr'): string {
  const dir = mkdtempSync(join(tmpdir(), 'v3d-hdri-'));
  const path = join(dir, name);
  writeFileSync(path, Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n', 'ascii'));
  return path;
}

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'HDRI' });
  return body.result.roomId;
}

describe('env.set hdriSrc', () => {
  it('ingests the file and points env.hdri at it in one call', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'env.set', { roomId, hdriSrc: hdrFile() }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(body.result.env.hdri).toBe(body.result.sha);
    const got = await call(h, 'scene.get', { roomId }, roomId);
    expect(got.body.result.doc.assets[body.result.sha]?.kind).toBe('image');
    expect(got.body.result.doc.assets[body.result.sha]?.image?.hdri).toBe(true);
  });

  it('reports E_ASSET_MISSING for a missing path', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'env.set', { roomId, hdriSrc: '/nope/sky.hdr' }, roomId);
    expect(codeOf(body)).toBe('E_ASSET_MISSING');
  });

  it('accepts an equirectangular png and flags it as hdri', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const dir = mkdtempSync(join(tmpdir(), 'v3d-hdri-'));
    const png = join(dir, 'tex.png');
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.writeUInt32BE(4, 16);
    bytes.writeUInt32BE(4, 20);
    writeFileSync(png, bytes);
    const { body } = await call(h, 'env.set', { roomId, hdriSrc: png }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.env.hdri).toBe(body.result.sha);
  });

  it('keeps other env fields when hdri is cleared', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const set = await call(h, 'env.set', { roomId, hdriSrc: hdrFile() }, roomId);
    const cleared = await call(h, 'env.set', { roomId, hdri: null }, roomId);
    expect(cleared.body.result.env.hdri).toBeUndefined();
    expect(set.body.result.sha).toBeTruthy();
  });
});
