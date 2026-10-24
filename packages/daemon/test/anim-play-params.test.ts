import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glb } from './helpers/glb';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function walkModel(h: Harness) {
  const created = await call(h, 'room.create', { name: 'play 参数' });
  const roomId = created.body.result.roomId;
  const dir = mkdtempSync(join(tmpdir(), 'v3d-play-'));
  const file = join(dir, 'walk.glb');
  writeFileSync(file, glb({ animations: ['walk'], skinned: true }));
  const imported = await call(h, 'node.import', { roomId, src: file }, roomId);
  return { roomId, nodeId: imported.body.result.nodeId as string };
}

async function animOf(h: Harness, roomId: string, nodeId: string) {
  const got = await call(h, 'node.get', { roomId, nodeId }, roomId);
  return got.body.result.anim;
}

describe('animation.play 参数', () => {
  it('首次播放补齐 loop/direction/weight 缺省值', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await walkModel(h);
    const played = await call(h, 'animation.play', { roomId, nodeId }, roomId);
    expect(played.body.error).toBeUndefined();
    expect(await animOf(h, roomId, nodeId)).toEqual({
      playing: true,
      clip: 'walk',
      speed: 1,
      loop: true,
      direction: 'forward',
      weight: 1,
    });
  });

  it('显式 loop/direction/weight 落库并原样回读', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await walkModel(h);
    const played = await call(
      h,
      'animation.play',
      { roomId, nodeId, clip: 'walk', speed: 2, loop: false, direction: 'reverse', weight: 0.4 },
      roomId,
    );
    expect(played.body.error).toBeUndefined();
    expect(await animOf(h, roomId, nodeId)).toEqual({
      playing: true,
      clip: 'walk',
      speed: 2,
      loop: false,
      direction: 'reverse',
      weight: 0.4,
    });
  });

  it('第二次播放未给的参数沿用上一次', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await walkModel(h);
    await call(
      h,
      'animation.play',
      { roomId, nodeId, loop: false, direction: 'reverse', weight: 0.25 },
      roomId,
    );
    await call(h, 'animation.play', { roomId, nodeId, speed: 0.5 }, roomId);
    expect(await animOf(h, roomId, nodeId)).toMatchObject({
      playing: true,
      speed: 0.5,
      loop: false,
      direction: 'reverse',
      weight: 0.25,
    });
  });

  it('撤销回到上一份播放状态', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await walkModel(h);
    const first = await call(h, 'animation.play', { roomId, nodeId }, roomId);
    await call(h, 'animation.play', { roomId, nodeId, loop: false, weight: 0.2 }, roomId);
    await call(h, 'scene.undo', { roomId }, roomId);
    expect(await animOf(h, roomId, nodeId)).toEqual({
      playing: true,
      clip: 'walk',
      speed: 1,
      loop: true,
      direction: 'forward',
      weight: 1,
    });
    expect(first.body.result.revision).toBeGreaterThan(0);
  });

  it('direction 非法与 weight 越界报 E_INVALID_PARAMS 且不改状态', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await walkModel(h);
    await call(h, 'animation.play', { roomId, nodeId }, roomId);
    const before = await animOf(h, roomId, nodeId);
    const badDirection = await call(h, 'animation.play', { roomId, nodeId, direction: 'sideways' }, roomId);
    expect(codeOf(badDirection.body)).toBe('E_INVALID_PARAMS');
    const badWeight = await call(h, 'animation.play', { roomId, nodeId, weight: 1.5 }, roomId);
    expect(codeOf(badWeight.body)).toBe('E_INVALID_PARAMS');
    expect(await animOf(h, roomId, nodeId)).toEqual(before);
  });
});
