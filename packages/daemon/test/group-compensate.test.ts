import { worldMatrix } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(1e-6));
};

async function scene(h: Harness, roomId: string) {
  return (await call(h, 'scene.export', { roomId }, roomId)).body.result.doc;
}

async function fixture(h: Harness) {
  const created = await call(h, 'room.create', { name: '编组补偿' });
  const roomId = created.body.result.roomId;
  const parent = await call(
    h,
    'node.create',
    {
      roomId,
      kind: 'group',
      name: '父级',
      transform: { p: [1, 2, 0], r: [0, 0.7, 0], s: [2, 1, 0.5] },
    },
    roomId,
  );
  const parentId = parent.body.result.nodeId;
  const ids: string[] = [];
  for (const [i, p] of [
    [0, 0, 0],
    [1, 1, 1],
    [-2, 0.5, 1],
  ].entries()) {
    const made = await call(
      h,
      'node.create',
      {
        roomId,
        kind: 'mesh',
        shape: 'box',
        parent: parentId,
        transform: { p: p as [number, number, number], r: [0, 0.2 * i, 0], s: [1, 1, 1] },
      },
      roomId,
    );
    ids.push(made.body.result.nodeId);
  }
  return { roomId, parentId, ids };
}

describe('node.group：世界矩阵不变的编组', () => {
  it('父级带旋转与缩放时，编组前后每子节点世界矩阵逐元素相等', async () => {
    const h = makeHarness();
    const { roomId, ids } = await fixture(h);
    const before = await scene(h, roomId);
    const beforeM = ids.map((id) => worldMatrix(before, id)!);

    const grouped = await call(h, 'node.group', { roomId, ids, name: '子组' }, roomId);
    expect(grouped.body.error).toBeUndefined();

    const after = await scene(h, roomId);
    ids.forEach((id, i) => near(worldMatrix(after, id)!, beforeM[i]!));
  });

  it('组自身不引入二次缩放，世界尺度保持不变', async () => {
    const h = makeHarness();
    const { roomId, ids } = await fixture(h);
    const before = await scene(h, roomId);
    const grouped = await call(h, 'node.group', { roomId, ids, name: '子组' }, roomId);
    const groupId = grouped.body.result.groupId;
    const after = await scene(h, roomId);
    expect(after.nodes[groupId]?.transform.s).toEqual([1, 1, 1]);
    for (const id of ids) near(worldMatrix(after, id)!, worldMatrix(before, id)!);
  });

  it('子节点 local 语义混合（p=0 绝对系与相对系）都保持世界位置', async () => {
    const h = makeHarness();
    const { roomId, ids } = await fixture(h);
    const before = await scene(h, roomId);
    await call(h, 'node.group', { roomId, ids, name: '子组' }, roomId);
    const after = await scene(h, roomId);
    const zero = ids[0]!;
    expect(before.nodes[zero]?.transform.p).toEqual([0, 0, 0]);
    near(worldMatrix(after, zero)!, worldMatrix(before, zero)!);
    for (const id of ids.slice(1)) near(worldMatrix(after, id)!, worldMatrix(before, id)!);
  });
});
