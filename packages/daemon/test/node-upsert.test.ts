import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness, name: string): Promise<string> {
  const { body } = await call(h, 'room.create', { name });
  return body.result.roomId;
}

const gemParams = (roomId: string) => ({
  roomId,
  kind: 'mesh',
  name: 'gem',
  shape: 'box',
  size: [1, 2, 3],
  color: '#ff8800',
  transform: { p: [1, 2, 3] },
});

describe('node.create upsert_by_name（V2-09 幂等重建）', () => {
  it('同脚本跑两遍：nodeId 稳定、无新 op、revision 不推进、scene.diff 为空', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-idem');

    const first = await call(h, 'node.create', { ...gemParams(roomId), upsert_by_name: true }, roomId);
    expect(first.body.error).toBeUndefined();
    const idA = first.body.result.nodeId;
    expect(first.body.result.upserted).toBeUndefined();
    const rev1 = first.body.result.revision;

    const second = await call(h, 'node.create', { ...gemParams(roomId), upsert_by_name: true }, roomId);
    expect(second.body.error).toBeUndefined();
    expect(second.body.result.nodeId).toBe(idA);
    expect(second.body.result.upserted).toBe(true);
    expect(second.body.result.revision).toBe(rev1);

    const diff = await call(h, 'scene.diff', { roomId, from: rev1, to: rev1, visual: true }, roomId);
    expect(diff.body.error).toBeUndefined();
    expect(diff.body.result.ops).toEqual([]);
    expect(diff.body.result.nodes).toEqual({ added: [], updated: [], removed: [] });
  });

  it('第二遍改参数：geometry / 材质参数随 upsert 更新到同 id', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-change');

    const first = await call(h, 'node.create', { ...gemParams(roomId), upsert_by_name: true }, roomId);
    const idA = first.body.result.nodeId;

    const second = await call(
      h,
      'node.create',
      { ...gemParams(roomId), size: [2, 2, 2], color: '#00cc66', upsert_by_name: true },
      roomId,
    );
    expect(second.body.error).toBeUndefined();
    expect(second.body.result.nodeId).toBe(idA);
    expect(second.body.result.revision).toBeGreaterThan(first.body.result.revision);

    const { body } = await call(h, 'scene.export', { roomId }, roomId);
    expect(body.result.doc.nodes[idA].geometry).toEqual({ type: 'box', size: [2, 2, 2] });
    const material = body.result.doc.materials[body.result.doc.nodes[idA].material];
    expect(material.baseColor[0]).toBeCloseTo(0, 2);
    expect(material.baseColor[1]).toBeCloseTo(0.8, 2);
  });

  it('默认不 upsert：同名再建得到两个节点', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-off');

    const a = await call(h, 'node.create', gemParams(roomId), roomId);
    const b = await call(h, 'node.create', gemParams(roomId), roomId);
    expect(b.body.result.nodeId).not.toBe(a.body.result.nodeId);
    const { body } = await call(h, 'scene.export', { roomId }, roomId);
    expect(Object.values<any>(body.result.doc.nodes).filter((n) => n.name === 'gem')).toHaveLength(2);
  });

  it('同名不同 kind 报 E_CONFLICT', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-kind');
    await call(h, 'node.create', gemParams(roomId), roomId);
    const { body } = await call(
      h,
      'node.create',
      { roomId, kind: 'light', name: 'gem', upsert_by_name: true },
      roomId,
    );
    expect(codeOf(body)).toBe('E_CONFLICT');
  });

  it('upsert_by_name 缺显式 name 报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-noname');
    const { body } = await call(
      h,
      'node.create',
      { roomId, kind: 'mesh', shape: 'box', upsert_by_name: true },
      roomId,
    );
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
  });

  it('light 同名 upsert：light 参数更新、nodeId 不变', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'upsert-light');

    const first = await call(
      h,
      'node.create',
      { roomId, kind: 'light', name: 'sun', upsert_by_name: true },
      roomId,
    );
    const idA = first.body.result.nodeId;

    const second = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'light',
        name: 'sun',
        upsert_by_name: true,
        light: { type: 'directional', color: [1, 1, 1, 1], intensity: 5, position: [3, 4, 5], castShadow: true },
      },
      roomId,
    );
    expect(second.body.error).toBeUndefined();
    expect(second.body.result.nodeId).toBe(idA);

    const { body } = await call(h, 'scene.export', { roomId }, roomId);
    expect(body.result.doc.nodes[idA].light.intensity).toBe(5);
  });
});

describe('显式 node.id 冲突（V2-09 裁决：E_CONFLICT，不覆盖）', () => {
  it('ops.apply 同 id 二次创建报 E_CONFLICT，原节点保留', async () => {
    const h = makeHarness();
    const roomId = await room(h, 'id-conflict');
    const node = { id: 'n_dup00001', name: '原节点', kind: 'group', parent: null, visible: true, transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } };
    const first = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node }] }, roomId);
    expect(first.body.error).toBeUndefined();

    const clash = { ...node, name: '后到节点' };
    const second = await call(h, 'ops.apply', { roomId, ops: [{ op: 'node.create', node: clash }] }, roomId);
    expect(codeOf(second.body)).toBe('E_CONFLICT');

    const { body } = await call(h, 'scene.export', { roomId }, roomId);
    expect(body.result.doc.nodes.n_dup00001.name).toBe('原节点');
  });
});
