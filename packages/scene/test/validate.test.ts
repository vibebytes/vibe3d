import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { validateDoc } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { CUBE, SHA_A, cubeDoc, modelNode } from './helpers';

const code = (fn: () => void): string => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

describe('validateDoc', () => {
  it('接受合法 doc', () => {
    expect(() => validateDoc(cubeDoc())).not.toThrow();
  });

  it('拒绝孤儿：parent 不存在', () => {
    const doc = cubeDoc();
    (doc.nodes[CUBE.id] as { parent: string | null }).parent = 'n_ffffffff';
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝根节点不在 roots 或 roots 重复', () => {
    const doc = cubeDoc();
    doc.roots = [];
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');
    const dup = cubeDoc();
    dup.roots = [CUBE.id, CUBE.id];
    expect(code(() => validateDoc(dup))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝成环', () => {
    const doc = cubeDoc();
    const a = { ...structuredClone(CUBE), id: 'n_0000000a' as const, parent: 'n_0000000b' as const };
    const b = { ...structuredClone(CUBE), id: 'n_0000000b' as const, parent: 'n_0000000a' as const };
    doc.nodes[a.id] = a;
    doc.nodes[b.id] = b;
    doc.roots = [];
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝缺失材质引用', () => {
    const doc = cubeDoc();
    delete doc.materials['m_00000001'];
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝缺失或非 gltf 的资产引用', () => {
    const doc = cubeDoc();
    doc.nodes['n_00000002'] = modelNode('n_00000002', SHA_A);
    doc.roots.push('n_00000002');
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');

    const bad = cubeDoc();
    bad.nodes['n_00000002'] = modelNode('n_00000002', SHA_A);
    bad.roots.push('n_00000002');
    bad.assets[SHA_A] = { sha: SHA_A, bytes: 10, name: 'a.png', mime: 'image/png', kind: 'image' };
    expect(code(() => validateDoc(bad))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝动画 clip 不在资产报告里', () => {
    const doc = cubeDoc();
    const node = {
      ...modelNode('n_00000002', SHA_A),
      anim: { playing: true, clip: 'run', speed: 1 },
    } as SceneDoc['nodes'][string];
    doc.nodes[node.id] = node;
    doc.roots.push('n_00000002');
    doc.assets[SHA_A] = {
      sha: SHA_A,
      bytes: 10,
      name: 'm.glb',
      mime: 'model/gltf-binary',
      kind: 'gltf',
      gltf: report(),
    };
    expect(code(() => validateDoc(doc))).toBe('E_INVALID_PARAMS');
  });

  it('拒绝零缩放、非有限数值与深度超限', () => {
    const zero = cubeDoc();
    (zero.nodes[CUBE.id] as { transform: { s: number[] } }).transform.s = [1, 0, 1];
    expect(code(() => validateDoc(zero))).toBe('E_INVALID_PARAMS');

    const inf = cubeDoc();
    (inf.nodes[CUBE.id] as { transform: { p: number[] } }).transform.p = [Number.POSITIVE_INFINITY, 0, 0];
    expect(code(() => validateDoc(inf))).toBe('E_INVALID_PARAMS');

    const deep = cubeDoc();
    let parent: `n_${string}` | null = null;
    for (let i = 0; i < 34; i++) {
      const id = `n_${String(i).padStart(8, 'a')}` as const;
      deep.nodes[id] = { ...structuredClone(CUBE), id, parent };
      if (parent === null) deep.roots.push(id);
      parent = id;
    }
    expect(code(() => validateDoc(deep))).toBe('E_INVALID_PARAMS');
  });
});

function report() {
  return {
    version: '2.0' as const,
    selfContained: true,
    missing: [],
    extensions: [],
    unsupported: [],
    meshes: 1,
    prims: 1,
    tris: 12,
    materials: 1,
    textures: 0,
    animations: [{ name: 'idle', durationSec: 2, channels: 3 }],
    skins: 1,
    size: {
      min: [0, 0, 0] as [number, number, number],
      max: [1, 1, 1] as [number, number, number],
      diag: 1.732,
    },
  };
}
