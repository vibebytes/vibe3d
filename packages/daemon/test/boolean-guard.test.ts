import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '布尔 AABB 口径' });
  return body.result.roomId;
}

async function create(h: Harness, roomId: string, input: Record<string, unknown>): Promise<string> {
  const { body } = await call(h, 'node.create', { roomId, kind: 'mesh', ...input }, roomId);
  return body.result.nodeId;
}

async function tube(h: Harness, roomId: string): Promise<string> {
  const { body } = await call(
    h,
    'mesh.tube',
    {
      roomId,
      name: 'pipe',
      points: [
        [-1, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
      ],
      radius: 0.2,
    },
    roomId,
  );
  return body.result.nodeId;
}

async function box(
  h: Harness,
  roomId: string,
  size: [number, number, number],
  p: [number, number, number],
): Promise<string> {
  return create(h, roomId, { shape: 'box', size, transform: { p } });
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

describe('mesh.boolean 非 box 目标守卫', () => {
  it('baked 目标默认拒绝，并提示 force 逃生门', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await tube(h, roomId);
    const tool = await box(h, roomId, [0.4, 0.4, 0.4], [0, 1, 0]);

    const { body } = await call(h, 'mesh.boolean', { roomId, target, tool }, roomId);
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
    expect(String(body.error.data?.hint ?? '')).toContain('force');
  });

  it('force:true 时按包围盒近似执行，结果标记 approximated', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await tube(h, roomId);
    const tool = await box(h, roomId, [0.4, 0.4, 0.4], [0, 1, 0]);

    const { body } = await call(h, 'mesh.boolean', { roomId, target, tool, force: true }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result).toMatchObject({ nodeId: target, approximated: true });
    expect(body.result.boxes).toBeGreaterThan(0);

    const d = await doc(h, roomId);
    expect(d.nodes[target].geometry.type).toBe('baked');
  });

  it('球体 force 时的 AABB 取直径而非单位盒', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await create(h, roomId, { shape: 'sphere', radius: 1 });
    const tool = await box(h, roomId, [0.5, 0.5, 0.5], [0, 0, 0]);

    const { body } = await call(
      h,
      'mesh.boolean',
      { roomId, target, tool, op: 'union', force: true },
      roomId,
    );
    expect(body.error).toBeUndefined();
    expect(body.result.approximated).toBe(true);

    const d = await doc(h, roomId);
    expect(d.nodes[target].geometry.bbox.min).toEqual([-1, -1, -1]);
    expect(d.nodes[target].geometry.bbox.max).toEqual([1, 1, 1]);
  });

  it('原生 box 走精确路径，approximated 为 false 且结果不变', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await box(h, roomId, [4, 3, 0.2], [0, 1.5, 0]);
    const tool = await box(h, roomId, [1, 2, 0.4], [0, 1, 0]);

    const { body } = await call(h, 'mesh.boolean', { roomId, target, tool }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result).toMatchObject({ nodeId: target, approximated: false, boxes: 3, tris: 36 });
  });

  it('model / group 不支持 force，仍报 E_UNSUPPORTED', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await create(h, roomId, { shape: 'box', size: [1, 1, 1] });
    const { body: g } = await call(h, 'node.create', { roomId, kind: 'group', name: 'g' }, roomId);
    const groupId = g.result.nodeId;

    const { body } = await call(
      h,
      'mesh.boolean',
      { roomId, target: groupId, tool: target, force: true },
      roomId,
    );
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
  });
});
