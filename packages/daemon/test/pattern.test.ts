import { describe, expect, it } from 'vitest';
import { patternPng } from '../src/render/pattern';
import { decodePng } from '../src/render/png';
import { type Harness, call, makeHarness } from './helpers/harness';

describe('铺装贴图', () => {
  it('pattern 生成的 PNG 能被 decodePng 解开，缝像素颜色等于 line', () => {
    const line: [number, number, number] = [0.2, 0.18, 0.16];
    const png = patternPng({ fill: [0.78, 0.74, 0.68], line, size: 32, gap: 8 });
    const image = decodePng(png);
    expect(image.width).toBe(32);
    expect(image.height).toBe(32);
    const byte = (v: number) => Math.round(v * 255);
    expect([image.data[0], image.data[1], image.data[2]]).toEqual([
      byte(line[0]),
      byte(line[1]),
      byte(line[2]),
    ]);
  });

  it('material.create 的 pattern 走 asset.register，并写到 material.map', async () => {
    const h = makeHarness();
    const { body: created } = await call(h, 'room.create', { name: '铺装' });
    const roomId = created.result.roomId as string;
    const made = await call(
      h,
      'material.create',
      { roomId, preset: 'concrete', pattern: { fill: [0.7, 0.68, 0.64], line: [0.25, 0.22, 0.2] } },
      roomId,
    );
    expect(made.body.error).toBeUndefined();
    const map = made.body.result.material.map as string;
    expect(map).toMatch(/^[a-f0-9]{64}$/);
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    expect(doc.assets[map]?.kind).toBe('image');
  });
});
