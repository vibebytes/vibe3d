import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '几何别名' });
  return body.result.roomId;
}

async function doc(h: Harness, roomId: string): Promise<any> {
  const { body } = await call(h, 'scene.export', { roomId }, roomId);
  return body.result.doc;
}

describe('geometry radius alias on the wire', () => {
  it('ops.apply 用 radius 建圆柱：落地为上下同半径，并在 warnings 里提示迁移', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'cylinder', radius: 0.5 },
      roomId,
    );
    const nodeId = created.body.result.nodeId;
    const before = await doc(h, roomId);
    await call(h, 'node.delete', { roomId, nodeId }, roomId);

    const node = {
      ...before.nodes[nodeId],
      id: 'n_abcdefgh',
      geometry: { type: 'cylinder', radius: 0.4, height: 2, segments: 16 },
    };
    const res = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node }] }, roomId);
    expect(res.body.error).toBeUndefined();
    expect(res.body.result.warnings.join(' ')).toContain('radiusTop');

    const after = await doc(h, roomId);
    expect(after.nodes.n_abcdefgh.geometry).toEqual({
      type: 'cylinder',
      radiusTop: 0.4,
      radiusBottom: 0.4,
      height: 2,
      segments: 16,
    });
  });

  it('node.create 支持 radiusTop/radiusBottom 建圆台（不需要走 ops）', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'cylinder', radiusTop: 0, radiusBottom: 0.6, height: 1.5 },
      roomId,
    );
    expect(created.body.error).toBeUndefined();
    const nodeId = created.body.result.nodeId;
    const g = (await doc(h, roomId)).nodes[nodeId].geometry;
    expect(g.radiusTop).toBe(0);
    expect(g.radiusBottom).toBe(0.6);
    expect(g.height).toBe(1.5);
  });

  it('flat radius 是文档路径，不产生迁移提示', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const created = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'cylinder', radius: 0.3 },
      roomId,
    );
    expect(created.body.error).toBeUndefined();
    expect(created.body.result.warnings).toBeUndefined();
    const g = (await doc(h, roomId)).nodes[created.body.result.nodeId].geometry;
    expect(g.radiusTop).toBe(0.3);
    expect(g.radiusBottom).toBe(0.3);
  });
});
