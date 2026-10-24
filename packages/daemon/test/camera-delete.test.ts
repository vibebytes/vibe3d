import { CAPABILITY_NAMES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function roomWithSaved(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '机位删除' });
  const roomId = body.result.roomId;
  await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', size: [1, 1, 1] }, roomId);
  await call(h, 'camera.save', { roomId, name: 'hero' }, roomId);
  return roomId;
}

describe('camera.delete', () => {
  it('能力已注册', () => {
    expect(CAPABILITY_NAMES).toContain('camera.delete');
  });

  it('删除已存机位后文档里不再有该名字', async () => {
    const h = makeHarness();
    const roomId = await roomWithSaved(h);
    const { body } = await call(h, 'camera.delete', { roomId, name: 'hero' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.cameras).toEqual({});
  });

  it('删未知名返回 E_CAMERA_NOT_FOUND', async () => {
    const h = makeHarness();
    const roomId = await roomWithSaved(h);
    const { body } = await call(h, 'camera.delete', { roomId, name: 'nope' }, roomId);
    expect(codeOf(body)).toBe('E_CAMERA_NOT_FOUND');
  });

  it('scene.undo 可把机位带回来', async () => {
    const h = makeHarness();
    const roomId = await roomWithSaved(h);
    await call(h, 'camera.delete', { roomId, name: 'hero' }, roomId);
    await call(h, 'scene.undo', { roomId }, roomId);
    const scene = await call(h, 'scene.get', { roomId }, roomId);
    expect(Object.keys(scene.body.result.doc.cameras)).toEqual(['hero']);
  });
});
