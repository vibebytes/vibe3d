import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '布尔守卫' });
  return body.result.roomId;
}

async function create(
  h: Harness,
  roomId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const { body } = await call(h, 'node.create', { roomId, kind: 'mesh', ...input }, roomId);
  return body.result.nodeId;
}

async function group(
  h: Harness,
  roomId: string,
  transform: Record<string, unknown>,
): Promise<string> {
  const { body } = await call(
    h,
    'node.create',
    { roomId, kind: 'group', name: 'g', transform },
    roomId,
  );
  return body.result.nodeId;
}

describe('mesh.boolean 变换守卫', () => {
  it('父级带缩放时拒绝执行，而不是按未缩放的坐标静默开洞', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const wall = await create(h, roomId, { shape: 'box', size: [4, 3, 0.2], transform: { p: [0, 1.5, 0] } });
    const parent = await group(h, roomId, { s: [2, 1, 1] });
    const door = await create(h, roomId, {
      shape: 'box',
      size: [1, 2, 0.4],
      parent,
      transform: { p: [0, 1, 0] },
    });

    const { body } = await call(h, 'mesh.boolean', { roomId, target: wall, tool: door }, roomId);
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
    expect(String(body.error.data?.hint ?? '')).toContain('reparent');
  });

  it('父级带 90° 旋转时拒绝执行，而不是把子节点位置当成未旋转坐标', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const wall = await create(h, roomId, { shape: 'box', size: [4, 3, 0.2], transform: { p: [0, 1.5, 0] } });
    const parent = await group(h, roomId, { r: [0, Math.PI / 2, 0] });
    const door = await create(h, roomId, {
      shape: 'box',
      size: [1, 2, 0.4],
      parent,
      transform: { p: [1, 1, 0] },
    });

    const { body } = await call(h, 'mesh.boolean', { roomId, target: wall, tool: door }, roomId);
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
  });

  it('父级只有平移时仍然可用，洞位随父级偏移', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const wall = await create(h, roomId, { shape: 'box', size: [4, 3, 0.2], transform: { p: [0, 1.5, 0] } });
    const parent = await group(h, roomId, { p: [1, 0, 0] });
    const door = await create(h, roomId, {
      shape: 'box',
      size: [1, 2, 0.4],
      parent,
      transform: { p: [0, 1, 0] },
    });

    const { body } = await call(h, 'mesh.boolean', { roomId, target: wall, tool: door }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.boxes).toBe(3);
  });
});
