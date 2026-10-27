import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

const pitchDeg = (cam: {
  p: [number, number, number];
  target: [number, number, number];
}): number => {
  const [dx, dy, dz] = [cam.p[0] - cam.target[0], cam.p[1] - cam.target[1], cam.p[2] - cam.target[2]];
  return (Math.asin(dy / Math.hypot(dx, dy, dz)) * 180) / Math.PI;
};

async function roomWithBox(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '机位' });
  const roomId = body.result.roomId;
  await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1], transform: { p: [0, 1, 0] } },
    roomId,
  );
  return roomId;
}

describe('camera.save / camera.set name / preset', () => {
  it('存机位后移开，再用名字恢复', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const saved = await call(h, 'camera.save', { roomId, name: 'hero' }, roomId);
    expect(saved.body.error).toBeUndefined();
    const pose = saved.body.result.camera;

    await call(h, 'camera.set', { roomId, camera: { p: [9, 9, 9] } }, roomId);
    const restored = await call(h, 'camera.set', { roomId, name: 'hero' }, roomId);
    expect(restored.body.result.camera).toEqual(pose);
  });

  it('未知名返回 E_CAMERA_NOT_FOUND', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const { body } = await call(h, 'camera.set', { roomId, name: 'nope' }, roomId);
    expect(codeOf(body)).toBe('E_CAMERA_NOT_FOUND');
  });

  it('miniature_45 俯角 45°', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const { body } = await call(h, 'camera.set', { roomId, preset: 'miniature_45' }, roomId);
    expect(body.error).toBeUndefined();
    expect(pitchDeg(body.result.camera)).toBeCloseTo(45, 1);
  });

  it('保存的机位随文档持久化', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    await call(h, 'camera.save', { roomId, name: 'hero' }, roomId);
    const scene = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(scene.body.result.doc.cameras)).toEqual(['hero']);
  });
});

describe('camera lens_mm / fov_h（V2-08b：36×24 全画幅）', () => {
  it('camera.set 接受 lens_mm=50：fov=26.99°（垂直）、fov_h=39.60°（水平）', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const { body } = await call(h, 'camera.set', { roomId, camera: { lens_mm: 50 } }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.camera.fov).toBeCloseTo(26.99, 2);
    expect(body.result.fov_h).toBeCloseTo(39.6, 2);
  });

  it('lens_mm 与 fov 互斥，同传报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const bad = await call(
      h,
      'camera.set',
      { roomId, camera: { lens_mm: 50, fov: 40 } },
      roomId,
    );
    expect(codeOf(bad.body)).toBe('E_INVALID_PARAMS');
  });

  it('camera.save 也接受 lens_mm（24mm → fov 53.13°）', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const saved = await call(
      h,
      'camera.save',
      { roomId, name: 'hero', camera: { lens_mm: 24 } },
      roomId,
    );
    expect(saved.body.error).toBeUndefined();
    expect(saved.body.result.camera.fov).toBeCloseTo(53.13, 2);
  });

  it('直接传 fov=40 时输出 fov_h 按同口径派生（36mm 水平）', async () => {
    const h = makeHarness();
    const roomId = await roomWithBox(h);
    const { body } = await call(h, 'camera.set', { roomId, camera: { fov: 40 } }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.fov_h).toBeCloseTo(57.2651, 2);
  });
});
