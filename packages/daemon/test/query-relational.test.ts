import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

type Built = { roomId: string; groupId: string; leftId: string; rightId: string };

async function build(h: Harness): Promise<Built> {
  const { body } = await call(h, 'room.create', { name: '关系查询' });
  const roomId = body.result.roomId;
  const group = await call(h, 'node.create', { roomId, kind: 'group', name: '平台' }, roomId);
  const groupId = group.body.result.nodeId;
  const left = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name: '左箱',
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: [0, 0.5, 0] },
      parent: groupId,
    },
    roomId,
  );
  const right = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'mesh',
      name: '右箱',
      shape: 'box',
      size: [1, 1, 1],
      transform: { p: [8, 0.5, 0] },
      parent: groupId,
    },
    roomId,
  );
  return {
    roomId,
    groupId,
    leftId: left.body.result.nodeId,
    rightId: right.body.result.nodeId,
  };
}

const idsOf = (body: any): string[] => body.result.nodes.map((item: { id: string }) => item.id).sort();

describe('scene.query 关系过滤', () => {
  it('parentId / hasChildren 透传到查询层', async () => {
    const h = makeHarness();
    const { roomId, groupId, leftId, rightId } = await build(h);

    const children = await call(h, 'scene.query', { roomId, parentId: groupId }, roomId);
    expect(children.body.error).toBeUndefined();
    expect(idsOf(children.body)).toEqual([leftId, rightId].sort());

    const roots = await call(h, 'scene.query', { roomId, parentId: null }, roomId);
    expect(idsOf(roots.body)).toEqual([groupId]);

    const branches = await call(h, 'scene.query', { roomId, hasChildren: true }, roomId);
    expect(idsOf(branches.body)).toEqual([groupId]);
  });

  it('withinBBox 只收整体落在框内的节点', async () => {
    const h = makeHarness();
    const { roomId, leftId } = await build(h);
    const inside = await call(
      h,
      'scene.query',
      { roomId, withinBBox: { min: [-1, -1, -1], max: [1, 2, 1] } },
      roomId,
    );
    expect(inside.body.error).toBeUndefined();
    expect(idsOf(inside.body)).toEqual([leftId]);
  });

  it('withinBBox 参数形状非法时报 E_INVALID_PARAMS', async () => {
    const h = makeHarness();
    const { roomId } = await build(h);
    const { body } = await call(h, 'scene.query', { roomId, withinBBox: { min: [0, 0, 0] } }, roomId);
    expect(body?.error?.data?.code ?? body?.error?.code).toBe('E_INVALID_PARAMS');
  });
});
