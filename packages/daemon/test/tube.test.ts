import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '管体' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

const line = [
  [0, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
] as [number, number, number][];

describe('mesh.tube', () => {
  it('创建 baked 管体节点并返回 tris', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(
      h,
      'mesh.tube',
      { roomId, points: line, radius: 0.1, segments: 8, radialSegments: 6 },
      roomId,
    );
    expect(body.ok).toBe(true);
    expect(body.result.tris).toBeGreaterThan(8 * 6 * 2 - 1);
    const nodeId = body.result.nodeId;
    const d = await doc(h, roomId);
    const node = d.nodes[nodeId];
    expect(node.kind).toBe('mesh');
    expect(node.geometry.type).toBe('baked');
    expect(node.geometry.positions.length).toBe(9 * 7 * 3);
    expect(node.material).toBeTruthy();
    expect(d.materials[node.material]).toBeTruthy();
  });

  it('closed 少一环顶点', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(
      h,
      'mesh.tube',
      { roomId, points: line, radius: 0.08, segments: 10, radialSegments: 4, closed: true },
      roomId,
    );
    const d = await doc(h, roomId);
    expect(d.nodes[body.result.nodeId].geometry.positions.length).toBe(10 * 5 * 3);
  });

  it('应用位置与父级，缺父级报 E_NODE_NOT_FOUND', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(
      h,
      'mesh.tube',
      {
        roomId,
        points: line,
        radius: 0.1,
        segments: 4,
        radialSegments: 4,
        transform: { p: [1, 2, 3] },
      },
      roomId,
    );
    const d = await doc(h, roomId);
    expect(d.nodes[body.result.nodeId].transform.p).toEqual([1, 2, 3]);

    const bad = await call(h, 'mesh.tube', { roomId, points: line, radius: 0.1, parent: 'n_nope' }, roomId);
    expect(bad.body.ok).toBe(false);
    expect(codeOf(bad.body)).toBe('E_NODE_NOT_FOUND');
  });

  it('点数不足报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'mesh.tube', { roomId, points: [[0, 0, 0]], radius: 0.1 }, roomId);
    expect(body.ok).toBe(false);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
  });
});
