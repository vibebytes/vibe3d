import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '布尔' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

async function box(
  h: Harness,
  roomId: string,
  size: [number, number, number],
  p: [number, number, number],
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { body } = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', size, transform: { p }, ...extra },
    roomId,
  );
  return body.result.nodeId;
}

describe('mesh.boolean', () => {
  it('subtract 开洞：烘焙成 baked 几何，门洞节点默认删除', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const wall = await box(h, roomId, [4, 3, 0.2], [0, 1.5, 0]);
    const door = await box(h, roomId, [1, 2, 0.4], [0, 1, 0]);

    const { body } = await call(h, 'mesh.boolean', { roomId, target: wall, tool: door }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result).toMatchObject({ nodeId: wall, boxes: 3, tris: 36 });

    const d = await doc(h, roomId);
    const node = d.nodes[wall];
    expect(node.geometry.type).toBe('baked');
    expect(node.geometry.positions.length).toBe(3 * 8 * 3);
    expect(node.geometry.indices.length).toBe(3 * 36);
    expect(node.geometry.bbox.min).toEqual([-2, -1.5, -0.1]);
    expect(node.geometry.bbox.max).toEqual([2, 1.5, 0.1]);
    expect(d.nodes[door]).toBeUndefined();
  });

  it('deleteTool:false 保留刀具体', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const wall = await box(h, roomId, [4, 3, 0.2], [0, 1.5, 0]);
    const door = await box(h, roomId, [1, 2, 0.4], [0, 1, 0]);
    const { body } = await call(
      h,
      'mesh.boolean',
      { roomId, target: wall, tool: door, deleteTool: false },
      roomId,
    );
    expect(body.result.boxes).toBe(3);
    const d = await doc(h, roomId);
    expect(d.nodes[door].geometry.type).toBe('box');
  });

  it('刀具完全覆盖目标时目标被删除', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const target = await box(h, roomId, [2, 2, 2], [0, 1, 0]);
    const tool = await box(h, roomId, [4, 4, 4], [0, 1, 0]);
    const { body } = await call(h, 'mesh.boolean', { roomId, target, tool }, roomId);
    expect(body.result).toMatchObject({ boxes: 0, tris: 0 });
    const d = await doc(h, roomId);
    expect(d.nodes[target]).toBeUndefined();
  });

  it('参数与节点校验：同节点 / 不存在 / 非 box / 非 90°', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const a = await box(h, roomId, [1, 1, 1], [0, 1, 0]);
    const b = await box(h, roomId, [1, 1, 1], [0.5, 1, 0]);

    expect(codeOf((await call(h, 'mesh.boolean', { roomId, target: a, tool: a }, roomId)).body)).toBe(
      'E_INVALID_PARAMS',
    );
    expect(
      codeOf((await call(h, 'mesh.boolean', { roomId, target: a, tool: 'n_ffffffff' }, roomId)).body),
    ).toBe('E_NODE_NOT_FOUND');

    const light = await call(h, 'node.create', { roomId, kind: 'light' }, roomId);
    expect(
      codeOf(
        (await call(h, 'mesh.boolean', { roomId, target: light.body.result.nodeId, tool: b }, roomId)).body,
      ),
    ).toBe('E_UNSUPPORTED');

    const tilted = await box(h, roomId, [1, 1, 1], [2, 1, 0], {
      transform: { p: [2, 1, 0], r: [0, 0.7, 0] },
    });
    expect(codeOf((await call(h, 'mesh.boolean', { roomId, target: tilted, tool: b }, roomId)).body)).toBe(
      'E_UNSUPPORTED',
    );
  });

  it('intersect 取交集后烘焙', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const a = await box(h, roomId, [2, 2, 2], [0, 1, 0]);
    const b = await box(h, roomId, [1, 1, 1], [0.5, 1, 0]);
    const { body } = await call(h, 'mesh.boolean', { roomId, target: a, tool: b, op: 'intersect' }, roomId);
    expect(body.result).toMatchObject({ boxes: 1, tris: 12 });
  });
});
