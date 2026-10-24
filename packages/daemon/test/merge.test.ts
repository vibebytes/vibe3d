import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function scene(h: Harness, roomId: string) {
  return (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
}

async function fixture(h: Harness) {
  const created = await call(h, 'room.create', { name: '合并' });
  const roomId = created.body.result.roomId;
  const group = await call(
    h,
    'node.create',
    { roomId, kind: 'group', name: '栏杆组', transform: { p: [3, 0, 0] } },
    roomId,
  );
  const groupId = group.body.result.nodeId;
  const ids: string[] = [];
  for (const p of [
    [0, 0, 0],
    [4, 0, 0],
    [8, 0, 0],
  ]) {
    const made = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'box', parent: groupId, transform: { p: p as [number, number, number] } },
      roomId,
    );
    ids.push(made.body.result.nodeId);
  }
  return { roomId, groupId, ids };
}

describe('node.merge', () => {
  it('把整组烘成一个 baked 节点，源节点与组一起消失', async () => {
    const h = makeHarness();
    const { roomId, groupId, ids } = await fixture(h);
    const { body } = await call(h, 'node.merge', { roomId, nodeId: groupId }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.sources).toEqual([...ids].sort());
    expect(body.result.tris).toBeGreaterThan(0);
    expect(body.result.vertices).toBeGreaterThan(0);

    const d = await scene(h, roomId);
    expect(d.nodes[groupId]).toBeUndefined();
    for (const id of ids) expect(d.nodes[id]).toBeUndefined();
    const merged = d.nodes[body.result.nodeId];
    expect(merged.kind).toBe('mesh');
    expect(merged.name).toBe('栏杆组');
    expect(merged.geometry.type).toBe('baked');
    expect(merged.geometry.positions.length).toBe(body.result.vertices * 3);
    expect(merged.geometry.normals?.length).toBe(merged.geometry.positions.length);
    expect(d.materials[merged.material]).toBeTruthy();
    expect(merged.transform.p).toEqual([3, 0, 0]);
  });

  it('烘焙后的世界位置与合并前一致', async () => {
    const h = makeHarness();
    const { roomId, groupId, ids } = await fixture(h);
    const before = await scene(h, roomId);
    const { nodeBounds } = await import('@vibebyte/vibe3d-scene');
    const boundsBefore = nodeBounds(before, groupId)!;

    const { body } = await call(h, 'node.merge', { roomId, nodeId: groupId }, roomId);
    const after = await scene(h, roomId);
    const boundsAfter = nodeBounds(after, body.result.nodeId)!;
    expect(boundsAfter.min.map((v) => Math.round(v * 1000) / 1000)).toEqual(
      boundsBefore.min.map((v) => Math.round(v * 1000) / 1000),
    );
    expect(boundsAfter.max.map((v) => Math.round(v * 1000) / 1000)).toEqual(
      boundsBefore.max.map((v) => Math.round(v * 1000) / 1000),
    );
    expect(ids.length).toBe(3);
  });

  it('组里有灯与模型时拒绝并给出 blockers', async () => {
    const h = makeHarness();
    const { roomId, groupId } = await fixture(h);
    const light = await call(h, 'node.create', { roomId, kind: 'light', parent: groupId }, roomId);
    const { body } = await call(h, 'node.merge', { roomId, nodeId: groupId }, roomId);
    expect(codeOf(body)).toBe('E_UNSUPPORTED');
    expect(body.error.data.blockers).toEqual([{ nodeId: light.body.result.nodeId, reason: 'light' }]);
  });

  it('目标是普通网格时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId, ids } = await fixture(h);
    const { body } = await call(h, 'node.merge', { roomId, nodeId: ids[0] }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
  });

  it('合并后不留下悬空父引用，revision 前进', async () => {
    const h = makeHarness();
    const { roomId, groupId } = await fixture(h);
    const { body } = await call(h, 'node.merge', { roomId, nodeId: groupId }, roomId);
    const d = await scene(h, roomId);
    for (const n of Object.values<any>(d.nodes)) {
      if (n.parent) expect(d.nodes[n.parent]).toBeTruthy();
    }
    expect(d.revision).toBeGreaterThanOrEqual(body.result.revision);
  });
});
