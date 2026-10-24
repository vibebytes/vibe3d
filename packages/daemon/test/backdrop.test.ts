import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function newRoom(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '背板' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc;
}

describe('mesh.backdrop', () => {
  it('创建 baked 背板节点：几何、法线、材质一并落库', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'mesh.backdrop', { roomId }, roomId);
    expect(codeOf(body)).toBeUndefined();
    const nodeId = body.result.nodeId;
    const d = await doc(h, roomId);
    const node = d.nodes[nodeId];
    expect(node.kind).toBe('mesh');
    expect(node.geometry.type).toBe('baked');
    expect(node.geometry.normals.length).toBe(node.geometry.positions.length);
    expect(node.geometry.bbox).toEqual({ min: [-5, 0, -4], max: [5, 6, 0] });
    expect(d.materials[node.material]).toBeTruthy();
    expect(body.result.tris).toBe(6 * 17);
  });

  it('默认不投影、不接收阴影，避免背板自带脏边', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'mesh.backdrop', { roomId }, roomId);
    const node = (await doc(h, roomId)).nodes[body.result.nodeId];
    expect(node.castShadow ?? false).toBe(false);
    expect(node.receiveShadow ?? false).toBe(false);
  });

  it('自定义尺寸与位移，包围盒随之偏移', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(
      h,
      'mesh.backdrop',
      { roomId, width: 8, depth: 3, height: 5, curve: 1, segments: 6, transform: { p: [1, 0, 2] } },
      roomId,
    );
    const node = (await doc(h, roomId)).nodes[body.result.nodeId];
    expect(node.transform.p).toEqual([1, 0, 2]);
    expect(node.geometry.bbox).toEqual({ min: [-4, 0, -3], max: [4, 5, 0] });
    expect(node.geometry.indices.length).toBe(6 * 7);
  });

  it('弧高超过墙面或进深报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const tall = await call(h, 'mesh.backdrop', { roomId, height: 1, curve: 1.2 }, roomId);
    expect(codeOf(tall.body)).toBe('E_INVALID_PARAMS');
    const deep = await call(h, 'mesh.backdrop', { roomId, depth: 1, curve: 1.2 }, roomId);
    expect(codeOf(deep.body)).toBe('E_INVALID_PARAMS');
  });

  it('父级不存在报 E_NODE_NOT_FOUND 且不落库', async () => {
    const h = makeHarness();
    const roomId = await newRoom(h);
    const { body } = await call(h, 'mesh.backdrop', { roomId, parent: 'n_missing0' }, roomId);
    expect(codeOf(body)).toBe('E_NODE_NOT_FOUND');
    expect(Object.keys((await doc(h, roomId)).nodes)).toHaveLength(0);
  });
});
