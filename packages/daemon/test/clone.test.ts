import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: '克隆' });
  return body.result.roomId;
}

async function nodes(h: Harness, roomId: string): Promise<Record<string, any>> {
  const { body } = await call(h, 'scene.get', { roomId }, roomId);
  return body.result.doc.nodes;
}

async function fixture(h: Harness, roomId: string) {
  const group = await call(h, 'node.create', { roomId, kind: 'group', name: '桌组' }, roomId);
  const gid = group.body.result.nodeId;
  const box = await call(
    h,
    'node.create',
    { roomId, kind: 'mesh', shape: 'box', name: '桌面', parent: gid },
    roomId,
  );
  const light = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'light',
      name: '灯',
      parent: gid,
      light: { type: 'point', color: [1, 1, 1, 1], intensity: 2, position: [0, 1, 0] },
    },
    roomId,
  );
  return { gid, boxId: box.body.result.nodeId, lightId: light.body.result.nodeId };
}

describe('node.clone', () => {
  it('深拷贝子树：换 id、共享材质、重命名并追加到同级末尾', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid, boxId } = await fixture(h, roomId);
    const before = await nodes(h, roomId);

    const { body } = await call(h, 'node.clone', { roomId, nodeId: gid, count: 2 }, roomId);
    expect(body.result.nodeIds).toHaveLength(2);
    expect(body.result.revision).toBeGreaterThan(0);

    const after = await nodes(h, roomId);
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 6);

    const [first, second] = body.result.nodeIds;
    expect(after[first].parent).toBeNull();
    expect(after[first].name).toBe('桌组 2');
    expect(after[second].name).toBe('桌组 3');

    for (const rootId of [first, second]) {
      const kids = Object.values(after).filter((n: any) => n.parent === rootId);
      expect(kids).toHaveLength(2);
      const copy = kids.find((n: any) => n.kind === 'mesh');
      expect(copy.material).toBe(before[boxId].material);
      expect(copy.id).not.toBe(boxId);
    }
  });

  it('transform 只覆盖克隆根，子树保持原样', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid } = await fixture(h, roomId);
    const { body } = await call(
      h,
      'node.clone',
      { roomId, nodeId: gid, transform: { p: [5, 0, 0] } },
      roomId,
    );
    const after = await nodes(h, roomId);
    const root = after[body.result.nodeIds[0]];
    expect(root.transform).toEqual({ p: [5, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
    const child = Object.values(after).find((n: any) => n.parent === root.id && n.kind === 'mesh');
    expect(child.transform.p).toEqual([0, 0, 0]);
  });

  it('克隆到别的父节点下不重名时保留原名', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid } = await fixture(h, roomId);
    const other = await call(h, 'node.create', { roomId, kind: 'group', name: '柜组' }, roomId);
    const { body } = await call(
      h,
      'node.clone',
      { roomId, nodeId: gid, parent: other.body.result.nodeId },
      roomId,
    );
    const after = await nodes(h, roomId);
    expect(after[body.result.nodeIds[0]].name).toBe('桌组');
    expect(after[body.result.nodeIds[0]].parent).toBe(other.body.result.nodeId);
  });

  it('拒绝克隆到自身子树内', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid, boxId } = await fixture(h, roomId);
    const { body } = await call(h, 'node.clone', { roomId, nodeId: gid, parent: boxId }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(Object.keys(await nodes(h, roomId))).toHaveLength(3);
  });

  it('拒绝 count 越界与不存在的节点', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid } = await fixture(h, roomId);

    const tooMany = await call(h, 'node.clone', { roomId, nodeId: gid, count: 65 }, roomId);
    expect(codeOf(tooMany.body)).toBe('E_INVALID_PARAMS');

    const missing = await call(h, 'node.clone', { roomId, nodeId: 'n_deadbeef' }, roomId);
    expect(codeOf(missing.body)).toBe('E_INVALID_PARAMS');
  });

  it('删除克隆根级联整棵副本，回到克隆前节点数', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    const { gid } = await fixture(h, roomId);
    const { body } = await call(h, 'node.clone', { roomId, nodeId: gid, count: 3 }, roomId);
    expect(Object.keys(await nodes(h, roomId))).toHaveLength(12);
    await call(h, 'node.delete', { roomId, nodeId: body.result.nodeIds[1] }, roomId);
    expect(Object.keys(await nodes(h, roomId))).toHaveLength(9);
  });
});
