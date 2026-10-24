import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const sway = { type: 'sway', channel: 'rz', amplitude: 0.2, frequency: 0.4 };

async function setup(h: Harness) {
  const created = await call(h, 'room.create', { name: 'sway 参数' });
  const roomId = created.body.result.roomId;
  const made = await call(h, 'node.create', { roomId, kind: 'mesh', name: '旗', shape: 'plane' }, roomId);
  return { roomId, nodeId: made.body.result.nodeId as string };
}

async function clipOf(h: Harness, roomId: string, nodeId: string): Promise<any> {
  const doc = (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
  return doc.nodes[nodeId]?.clip;
}

describe('animation.define sway 参数', () => {
  it('axis 与 gust 落库并可回读', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const { body } = await call(
      h,
      'animation.define',
      { roomId, nodeId, clip: { ...sway, axis: 'x', gust: 0.6 } },
      roomId,
    );
    expect(body.error).toBeUndefined();
    const got = await clipOf(h, roomId, nodeId);
    expect(got.axis).toBe('x');
    expect(got.gust).toBeCloseTo(0.6, 9);
  });

  it('非法 axis 报 E_INVALID_PARAMS 且不改状态', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    const { body } = await call(
      h,
      'animation.define',
      { roomId, nodeId, clip: { ...sway, axis: 'w' } },
      roomId,
    );
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(await clipOf(h, roomId, nodeId)).toBeUndefined();

    const ok = await call(h, 'animation.define', { roomId, nodeId, clip: sway }, roomId);
    expect(ok.body.error).toBeUndefined();
    const bad = await call(h, 'animation.define', { roomId, nodeId, clip: { ...sway, axis: 'q' } }, roomId);
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
    expect((await clipOf(h, roomId, nodeId)).axis).toBeUndefined();
  });

  it('gust 超出 0..1 报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId, nodeId } = await setup(h);
    for (const gust of [1.5, -0.1]) {
      const { body } = await call(h, 'animation.define', { roomId, nodeId, clip: { ...sway, gust } }, roomId);
      expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    }
    expect(await clipOf(h, roomId, nodeId)).toBeUndefined();
  });
});
