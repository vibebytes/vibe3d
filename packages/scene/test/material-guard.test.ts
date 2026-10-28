import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { MAT, cubeDoc } from './helpers';

const fail = (doc: SceneDoc, force?: boolean): AppError => {
  try {
    applyOps(doc, [{ op: 'material.delete', id: 'm_00000001', ...(force === undefined ? {} : { force }) }]);
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error('应当抛错');
};

describe('material.delete 引用守卫', () => {
  it('有引用且未 force：E_MATERIAL_IN_USE 并列出引用节点', () => {
    const err = fail(cubeDoc());
    expect(err.code).toBe('E_MATERIAL_IN_USE');
    expect(err.data?.nodes).toEqual(['n_00000001']);
    expect(err.data?.material).toBe('m_00000001');
  });

  it('force:true 删除并把引用回落到默认材质，逆操作可完整还原', () => {
    const doc = cubeDoc();
    const { doc: next, inverse } = applyOps(doc, [{ op: 'material.delete', id: 'm_00000001', force: true }]);
    expect(next.materials.m_00000001).toBeUndefined();
    const fallback = next.nodes.n_00000001;
    expect(fallback?.kind === 'mesh' ? fallback.material : undefined).toBe('m_00000000');
    expect(next.materials.m_00000000).toBeDefined();

    const { doc: back } = applyOps(next, inverse);
    expect(inverse.map((op) => op.op).sort()).toEqual(['material.delete', 'material.set', 'node.update']);
    expect(back.materials.m_00000001).toEqual(MAT);
    const restored = back.nodes.n_00000001;
    expect(restored?.kind === 'mesh' ? restored.material : undefined).toBe('m_00000001');
  });

  it('未引用的材质正常删除', () => {
    const doc = cubeDoc();
    doc.materials.m_00000002 = { ...structuredClone(MAT), roughness: 0.9 };
    const { doc: next } = applyOps(doc, [{ op: 'material.delete', id: 'm_00000002' }]);
    expect(next.materials.m_00000002).toBeUndefined();
    expect(next.materials.m_00000001).toBeDefined();
  });
});
