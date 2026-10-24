import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '柔光箱' });
  return body.result.roomId;
}

const AREA = {
  type: 'area',
  color: [1, 1, 1, 1],
  intensity: 4,
  position: [0, 3, 1],
  target: [0, 0, 0],
  width: 3,
  height: 1.5,
};

describe('area 柔光箱', () => {
  it('创建后能回读尺寸与朝向', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'light', name: '主柔光箱', light: AREA },
      roomId,
    );
    const got = await call(h, 'node.get', { roomId, nodeId: created.body.result.nodeId }, roomId);
    expect(got.body.result.light).toEqual(AREA);
  });

  it('宽高必须为正数', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    for (const bad of [{ width: 0 }, { height: -1 }]) {
      const res = await call(h, 'node.create', { roomId, kind: 'light', light: { ...AREA, ...bad } }, roomId);
      expect(codeOf(res.body)).toBe('E_INVALID_PARAMS');
    }
  });

  it('area 不支持阴影，显式 castShadow 被拒；其余类型宽高无意义也被拒', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const shadow = await call(
      h,
      'node.create',
      { roomId, kind: 'light', light: { ...AREA, castShadow: true } },
      roomId,
    );
    expect(codeOf(shadow.body)).toBe('E_INVALID_PARAMS');

    const stray = await call(
      h,
      'node.create',
      { roomId, kind: 'light', light: { ...AREA, type: 'point' } },
      roomId,
    );
    expect(codeOf(stray.body)).toBe('E_INVALID_PARAMS');
  });

  it('node.update 可把点光源改成柔光箱并保留尺寸', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const created = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'light',
        light: { type: 'point', color: [1, 1, 1, 1], intensity: 1, position: [1, 1, 1] },
      },
      roomId,
    );
    const nodeId = created.body.result.nodeId;
    const updated = await call(h, 'node.update', { roomId, nodeId, patch: { light: AREA } }, roomId);
    expect(updated.body.result.revision).toBeGreaterThan(created.body.result.revision);

    const got = await call(h, 'node.get', { roomId, nodeId }, roomId);
    expect(got.body.result.light).toEqual(AREA);
  });
});
