import { type Op, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps, changedPaths } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { CUBE, cubeDoc } from './helpers';

const create = (node: SceneNode): Op => ({ op: 'node.create', node });

describe('changedPaths', () => {
  it('字段级：只报真正改动的路径，revision 变化不算', () => {
    const before = cubeDoc();
    const { doc } = applyOps(before, [
      { op: 'node.update', id: CUBE.id, patch: { transform: { ...CUBE.transform, p: [1, 2, 3] } } },
    ]);
    const next = { ...doc, revision: before.revision + 7, updatedAt: '2026-01-01T00:00:00.000Z' };

    expect(changedPaths(before, next)).toEqual({
      paths: [`/nodes/${CUBE.id}/transform/p`],
      truncated: false,
    });
  });

  it('增删节点：新增报节点本身，删除报被删节点', () => {
    const before = cubeDoc();
    const extra = { ...structuredClone(CUBE), id: 'n_00000002' as const, name: '灯座' };
    const added = applyOps(before, [create(extra)]).doc;
    expect(changedPaths(before, added).paths).toEqual(['/nodes/n_00000002', '/roots']);

    const removed = applyOps(added, [{ op: 'node.delete', id: CUBE.id }]).doc;
    expect(changedPaths(added, removed).paths).toEqual([`/nodes/${CUBE.id}`, '/roots']);
  });

  it('无改动时为空；截断时按 limit 收敛并标 truncated', () => {
    const before = cubeDoc();
    expect(changedPaths(before, structuredClone(before))).toEqual({ paths: [], truncated: false });
    expect(emptyDoc('x').nodes).toEqual({});

    const nodes: SceneNode[] = Array.from({ length: 40 }, (_, i) => ({
      ...structuredClone(CUBE),
      id: `n_${String(i + 2).padStart(8, '0')}` as const,
      name: `n-${i}`,
    }));
    const grew = applyOps(
      before,
      nodes.map((node) => create(node)),
    ).doc;

    const all = changedPaths(before, grew, { limit: 100 });
    expect(all.paths).toHaveLength(41);
    expect(all.truncated).toBe(false);

    const capped = changedPaths(before, grew, { limit: 32 });
    expect(capped.paths).toHaveLength(32);
    expect(capped.truncated).toBe(true);
    expect(changedPaths(before, grew, { limit: 32 })).toEqual(capped);
  });
});
