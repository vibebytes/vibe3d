import { AppError, type Op, type SceneDoc, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { CUBE, MAT, SHA_A, cubeDoc, modelNode } from './helpers';

const code = (fn: () => void): string => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const create = (node: SceneDoc['nodes'][string]): Op => ({ op: 'node.create', node });

describe('applyOps', () => {
  it('建节点：写 nodes 与 roots', () => {
    const doc = emptyDoc();
    doc.materials['m_00000001'] = structuredClone(MAT);
    const { doc: next } = applyOps(doc, [create(structuredClone(CUBE))]);
    expect(next.nodes[CUBE.id]?.name).toBe('立方体');
    expect(next.roots).toEqual([CUBE.id]);
    expect(doc.nodes[CUBE.id]).toBeUndefined();
  });

  it('建子节点：不进 roots，parent 正确', () => {
    const doc = cubeDoc();
    const child = { ...structuredClone(CUBE), id: 'n_00000002' as const, parent: CUBE.id };
    const { doc: next } = applyOps(doc, [create(child)]);
    expect(next.roots).toEqual([CUBE.id]);
    expect(next.nodes['n_00000002']?.parent).toBe(CUBE.id);
  });

  it('update 只改给出的字段，并生成逆操作', () => {
    const doc = cubeDoc();
    const res = applyOps(doc, [{ op: 'node.update', id: CUBE.id, patch: { visible: false, name: '砖' } }]);
    expect(res.doc.nodes[CUBE.id]).toMatchObject({ visible: false, name: '砖' });
    expect(res.doc.nodes[CUBE.id]?.transform.p).toEqual([0, 0.5, 0]);
    expect(res.inverse).toEqual([
      { op: 'node.update', id: CUBE.id, patch: { visible: true, name: '立方体' } },
    ]);
  });

  it('delete 级联删除子树，逆操作可完整恢复', () => {
    const doc = cubeDoc();
    const child = { ...structuredClone(CUBE), id: 'n_00000002' as const, parent: CUBE.id };
    const seeded = applyOps(doc, [create(child)]).doc;
    const res = applyOps(seeded, [{ op: 'node.delete', id: CUBE.id }]);
    expect(Object.keys(res.doc.nodes)).toHaveLength(0);
    expect(res.doc.roots).toEqual([]);
    const back = applyOps(res.doc, res.inverse).doc;
    expect(back.nodes).toEqual(seeded.nodes);
    expect(back.roots).toEqual(seeded.roots);
  });

  it('delete cascade=false 且有子节点时报错，doc 不变', () => {
    const doc = cubeDoc();
    const child = { ...structuredClone(CUBE), id: 'n_00000002' as const, parent: CUBE.id };
    const seeded = applyOps(doc, [create(child)]).doc;
    const snapshot = structuredClone(seeded);
    expect(code(() => applyOps(seeded, [{ op: 'node.delete', id: CUBE.id, cascade: false }]))).toBe(
      'E_INVALID_PARAMS',
    );
    expect(seeded).toEqual(snapshot);
  });

  it('reparent 改父并维护 roots，成环被拒', () => {
    const doc = emptyDoc();
    doc.materials['m_00000001'] = structuredClone(MAT);
    const a = { ...structuredClone(CUBE), id: 'n_0000000a' as const };
    const b = { ...structuredClone(CUBE), id: 'n_0000000b' as const };
    const seeded = applyOps(doc, [create(a), create(b)]).doc;
    const moved = applyOps(seeded, [{ op: 'node.reparent', id: 'n_0000000b', parent: 'n_0000000a' }]).doc;
    expect(moved.roots).toEqual(['n_0000000a']);
    expect(moved.nodes['n_0000000b']?.parent).toBe('n_0000000a');
    expect(
      code(() => applyOps(moved, [{ op: 'node.reparent', id: 'n_0000000a', parent: 'n_0000000b' }])),
    ).toBe('E_INVALID_PARAMS');
  });

  it('material.set 是 upsert，逆操作可删除或还原', () => {
    const doc = cubeDoc();
    const added = applyOps(doc, [{ op: 'material.set', id: 'm_00000002', material: structuredClone(MAT) }]);
    expect(added.doc.materials['m_00000002']).toBeDefined();
    expect(applyOps(added.doc, added.inverse).doc.materials).toEqual(doc.materials);

    const changed = applyOps(doc, [
      { op: 'material.set', id: 'm_00000001', material: { ...structuredClone(MAT), metalness: 1 } },
    ]);
    expect(applyOps(changed.doc, changed.inverse).doc.materials).toEqual(doc.materials);
  });

  it('animation.play 缺省取首个 clip，stop 保留 clip 与 speed；非 model 节点报错', () => {
    const doc = cubeDoc();
    const node = modelNode('n_00000002', SHA_A);
    doc.nodes[node.id] = node;
    doc.roots.push(node.id);
    doc.assets[SHA_A] = {
      sha: SHA_A,
      bytes: 10,
      name: 'm.glb',
      mime: 'model/gltf-binary',
      kind: 'gltf',
      gltf: {
        version: '2.0',
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
        size: { min: [0, 0, 0], max: [1, 1, 1], diag: 1.732 },
      },
    };
    const played = applyOps(doc, [{ op: 'animation.play', target: node.id }]).doc;
    expect(played.nodes[node.id]).toMatchObject({ anim: { playing: true, clip: 'idle', speed: 1 } });
    const stopped = applyOps(played, [{ op: 'animation.stop', target: node.id }]).doc;
    expect(stopped.nodes[node.id]).toMatchObject({ anim: { playing: false, clip: 'idle', speed: 1 } });
    expect(code(() => applyOps(doc, [{ op: 'animation.play', target: CUBE.id }]))).toBe('E_INVALID_PARAMS');
  });

  it('camera.set frame 由场景包围盒算出具体相机', () => {
    const doc = cubeDoc();
    const { doc: next } = applyOps(doc, [{ op: 'camera.set', frame: 'fit' }]);
    expect(next.camera.target[1]).toBeCloseTo(0.5, 5);
    expect(next.camera.p.every(Number.isFinite)).toBe(true);
    expect(next.camera.p[2]).toBeGreaterThan(0.5);
  });

  it('混合批次：apply → 逆操作 → doc 深等', () => {
    const doc = cubeDoc();
    const ops: Op[] = [
      {
        op: 'node.update',
        id: CUBE.id,
        patch: { transform: { p: [1, 2, 3], r: [0.1, 0, 0], s: [2, 2, 2] } },
      },
      { op: 'env.set', env: { ambientIntensity: 0.9 } },
      { op: 'stage.set', stage: { preset: 'cine', ground: false } },
      { op: 'material.set', id: 'm_00000001', material: { ...structuredClone(MAT), roughness: 1 } },
      { op: 'camera.set', camera: { fov: 30 } },
      { op: 'node.reparent', id: CUBE.id, parent: null, index: 0 },
    ];
    const res = applyOps(doc, ops);
    expect(applyOps(res.doc, res.inverse).doc).toEqual(doc);
  });

  it('env.set 支持 null 清除 HDRI，逆操作可恢复', () => {
    const doc = cubeDoc();
    doc.assets[SHA_A] = {
      sha: SHA_A,
      bytes: 2048,
      name: 'sky.hdr',
      mime: 'image/vnd.radiance',
      kind: 'image',
      image: { width: 1024, height: 512, hdri: true },
    };
    const set = applyOps(doc, [{ op: 'env.set', env: { hdri: SHA_A } }]);
    expect(set.doc.env.hdri).toBe(SHA_A);
    const cleared = applyOps(set.doc, [{ op: 'env.set', env: { hdri: null } }]);
    expect(cleared.doc.env.hdri).toBeUndefined();
    expect(applyOps(cleared.doc, cleared.inverse).doc.env.hdri).toBe(SHA_A);
    expect(applyOps(set.doc, set.inverse).doc.env.hdri).toBeUndefined();
  });

  it('原子性：任一 op 失败则整批不生效', () => {
    const doc = cubeDoc();
    const snapshot = structuredClone(doc);
    expect(
      code(() =>
        applyOps(doc, [
          create({ ...structuredClone(CUBE), id: 'n_00000009' as const }),
          { op: 'node.update', id: 'n_ffffffff', patch: { visible: false } },
        ]),
      ),
    ).toBe('E_INVALID_PARAMS');
    expect(doc).toEqual(snapshot);
  });

  it('scene.replace 整体替换并把旧 doc 作为逆操作', () => {
    const doc = cubeDoc();
    const incoming = emptyDoc('新场景');
    const res = applyOps(doc, [{ op: 'scene.replace', doc: incoming }]);
    expect(res.doc.name).toBe('新场景');
    expect(applyOps(res.doc, res.inverse).doc).toEqual(doc);
  });
});
