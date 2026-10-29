import { bevelMesh, latheMesh, organicMesh } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { call, makeHarness } from './helpers/harness';

async function room(): Promise<{ h: ReturnType<typeof makeHarness>; roomId: string }> {
  const h = makeHarness();
  const created = await call(h, 'room.create', { name: 'sculpt' });
  return { h, roomId: created.body.result.roomId as string };
}

describe('造型网格', () => {
  it('mesh.lathe 写入 baked，三角面数与生成器一致', async () => {
    const { h, roomId } = await room();
    const profile: [number, number][] = [
      [0.4, 0],
      [0.2, 1],
    ];
    const expected = latheMesh({ profile, segments: 8 });
    const { body } = await call(h, 'mesh.lathe', { roomId, profile, segments: 8, name: '杯' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.tris).toBe(expected.indices.length / 3);
    const got = await call(h, 'node.get', { roomId, nodeId: body.result.nodeId }, roomId);
    expect(got.body.result.geometry.type).toBe('baked');
  });

  it('mesh.organic 与 mesh.bevel 同样是 baked', async () => {
    const { h, roomId } = await room();
    const organic = organicMesh({
      radius: [0.4, 0.8, 0.4],
      seed: 2,
      amplitude: 0.05,
      segments: 6,
      flatBottom: true,
    });
    const made = await call(
      h,
      'mesh.organic',
      { roomId, radius: [0.4, 0.8, 0.4], seed: 2, amplitude: 0.05, segments: 6, flatBottom: true },
      roomId,
    );
    expect(made.body.error).toBeUndefined();
    expect(made.body.result.tris).toBe(organic.indices.length / 3);
    const bevel = bevelMesh({ size: [1, 0.6, 0.4], radius: 0.05, segments: 3 });
    const cut = await call(
      h,
      'mesh.bevel',
      { roomId, size: [1, 0.6, 0.4], radius: 0.05, segments: 3 },
      roomId,
    );
    expect(cut.body.error).toBeUndefined();
    expect(cut.body.result.tris).toBe(bevel.indices.length / 3);
    const figure = await call(h, 'mesh.mannequin', { roomId, pose: 'jog_away', seed: 3 }, roomId);
    expect(figure.body.error).toBeUndefined();
    expect(figure.body.result.materialId).not.toBe(figure.body.result.clothMaterialId);
  });

  it('node.merge smooth 的顶点数不同于硬合并，超限时带 warning 并退回硬合并', async () => {
    const { h, roomId } = await room();
    const makePair = async (name: string) => {
      const group = await call(h, 'node.create', { roomId, kind: 'group', name }, roomId);
      const groupId = group.body.result.nodeId as string;
      await call(
        h,
        'node.create',
        { roomId, kind: 'mesh', name: `${name}-a`, shape: 'sphere', radius: 0.6, parent: groupId },
        roomId,
      );
      await call(
        h,
        'node.create',
        {
          roomId,
          kind: 'mesh',
          name: `${name}-b`,
          shape: 'sphere',
          radius: 0.6,
          parent: groupId,
          transform: { p: [0.4, 0, 0] },
        },
        roomId,
      );
      return groupId;
    };
    const hard = await call(h, 'node.merge', { roomId, nodeId: await makePair('硬') }, roomId);
    const soft = await call(
      h,
      'node.merge',
      { roomId, nodeId: await makePair('软'), smooth: true, resolution: 8 },
      roomId,
    );
    expect(soft.body.error).toBeUndefined();
    expect(soft.body.result.vertices).not.toBe(hard.body.result.vertices);
    const limited = await call(
      h,
      'node.merge',
      { roomId, nodeId: await makePair('限'), smooth: true, resolution: 70 },
      roomId,
    );
    expect(limited.body.error).toBeUndefined();
    expect(limited.body.result.warning).toMatch(/300000/);
    expect(limited.body.result.vertices).toBe(hard.body.result.vertices);
  });
});
