import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string | undefined => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '渐变背景' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

const GRADIENT = { top: [1, 1, 1, 1], bottom: [0, 0, 0, 1] };

describe('env.set gradient', () => {
  it('落库上下双色渐变并原样回读', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'env.set', { roomId, gradient: GRADIENT }, roomId);
    expect(codeOf(body)).toBeUndefined();
    expect(body.result.env.gradient).toEqual(GRADIENT);
    const d = await doc(h, roomId);
    expect(d.env.gradient).toEqual(GRADIENT);
  });

  it('不带 gradient 的 env.set 保留已有渐变', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    await call(h, 'env.set', { roomId, gradient: GRADIENT }, roomId);
    const { body } = await call(h, 'env.set', { roomId, ambientIntensity: 0.8 }, roomId);
    expect(body.result.env.gradient).toEqual(GRADIENT);
    expect(body.result.env.ambientIntensity).toBe(0.8);
  });

  it('gradient: null 清除渐变，回到纯色背景', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    await call(h, 'env.set', { roomId, gradient: GRADIENT }, roomId);
    const { body } = await call(h, 'env.set', { roomId, gradient: null }, roomId);
    expect(body.result.env.gradient).toBeNull();
    const d = await doc(h, roomId);
    expect(d.env.gradient).toBeNull();
  });
});
