import { type SceneDoc, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps, validateDoc } from '@vibebyte/vibe3d-scene';
import { describe, expect, it } from 'vitest';
import { CUBE, MAT, SHA_A, SHA_B, cubeDoc, modelNode } from './helpers';

const code = (fn: () => void): string => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

const imageAsset = (sha: string, hdri = false) => ({
  sha,
  bytes: 10,
  name: 'tex.png',
  mime: 'image/png',
  kind: 'image' as const,
  image: { width: 4, height: 4, hdri },
});

function modelDoc(): SceneDoc {
  const doc = emptyDoc('models');
  doc.nodes['n_00000001'] = modelNode('n_00000001', SHA_A);
  doc.roots = ['n_00000001'];
  doc.assets[SHA_A] = {
    sha: SHA_A,
    bytes: 1,
    name: 'a.glb',
    mime: 'model/gltf-binary',
    kind: 'gltf',
    gltf: {
      version: '2.0',
      selfContained: true,
      missing: [],
      extensions: [],
      unsupported: [],
      tris: 1,
      prims: 1,
      meshes: 1,
      materials: 0,
      textures: 0,
      animations: [],
      skins: 0,
      size: { min: [0, 0, 0], max: [1, 1, 1], diag: 1.73 },
    },
  };
  doc.assets[SHA_B] = structuredClone(doc.assets[SHA_A]!);
  doc.assets[SHA_B]!.sha = SHA_B;
  return doc;
}

describe('node.update 内容替换（G2）', () => {
  it('mesh 可换 geometry 与 material，逆操作还原', () => {
    const doc = cubeDoc();
    doc.materials['m_00000002'] = structuredClone(MAT);
    const res = applyOps(doc, [
      {
        op: 'node.update',
        id: CUBE.id,
        patch: { geometry: { type: 'sphere', radius: 2, segments: 16 }, material: 'm_00000002' },
      },
    ]);
    expect(res.doc.nodes[CUBE.id]).toMatchObject({
      geometry: { type: 'sphere', radius: 2 },
      material: 'm_00000002',
    });
    expect(res.inverse).toEqual([
      {
        op: 'node.update',
        id: CUBE.id,
        patch: { geometry: { type: 'box', size: [1, 1, 1] }, material: 'm_00000001' },
      },
    ]);
    const back = applyOps(res.doc, res.inverse).doc;
    expect(back.nodes[CUBE.id]).toEqual(CUBE);
  });

  it('geometry / material 用在 model 上报错，材质不存在也报错', () => {
    const doc = modelDoc();
    expect(
      code(() => applyOps(doc, [{ op: 'node.update', id: 'n_00000001', patch: { material: 'm_00000001' } }])),
    ).toBe('E_INVALID_PARAMS');
    expect(
      code(() =>
        applyOps(cubeDoc(), [{ op: 'node.update', id: CUBE.id, patch: { material: 'm_00000009' } }]),
      ),
    ).toBe('E_INVALID_PARAMS');
  });

  it('model 换 sha 时清 anim，逆操作带回旧动画', () => {
    const doc = modelDoc();
    const source = doc.nodes['n_00000001']!;
    if (source.kind !== 'model') throw new Error('expect model');
    source.anim = { playing: true, clip: 'Idle', speed: 1 };
    const res = applyOps(doc, [{ op: 'node.update', id: 'n_00000001', patch: { sha: SHA_B } }]);
    const next = res.doc.nodes['n_00000001']!;
    expect(next.kind === 'model' && next.sha).toBe(SHA_B);
    expect('anim' in next).toBe(false);
    expect(res.inverse).toEqual([
      {
        op: 'node.update',
        id: 'n_00000001',
        patch: { sha: SHA_A, anim: { playing: true, clip: 'Idle', speed: 1 } },
      },
    ]);
  });

  it('sha 必须是已注册 glTF', () => {
    expect(
      code(() => applyOps(modelDoc(), [{ op: 'node.update', id: 'n_00000001', patch: { sha: SHA_B } }])),
    ).toBe('OK');
    expect(
      code(() =>
        applyOps(modelDoc(), [{ op: 'node.update', id: 'n_00000001', patch: { sha: 'c'.repeat(64) } }]),
      ),
    ).toBe('E_INVALID_PARAMS');
  });
});

describe('validateDoc 资产引用（G1）', () => {
  it('material.map 必须是普通图片资产', () => {
    const doc = cubeDoc();
    doc.materials['m_00000001']!.map = SHA_A;
    doc.assets[SHA_A] = imageAsset(SHA_A);
    expect(() => validateDoc(doc)).not.toThrow();

    doc.materials['m_00000001']!.map = SHA_B;
    doc.assets[SHA_B] = imageAsset(SHA_B, true);
    expect(code(() => validateDoc(doc))).toBe('E_ASSET_TYPE');

    doc.assets[SHA_B] = { ...imageAsset(SHA_B), kind: 'gltf' };
    expect(code(() => validateDoc(doc))).toBe('E_ASSET_TYPE');
  });

  it('env.hdri 接受任意图片资产（含等距柱状 png）', () => {
    const doc = cubeDoc();
    doc.env.hdri = SHA_A;
    doc.assets[SHA_A] = imageAsset(SHA_A);
    expect(() => validateDoc(doc)).not.toThrow();
    doc.assets[SHA_A] = imageAsset(SHA_A, true);
    expect(() => validateDoc(doc)).not.toThrow();
    doc.assets[SHA_A] = { ...imageAsset(SHA_A), kind: 'gltf' };
    expect(code(() => validateDoc(doc))).toBe('E_ASSET_TYPE');
    doc.assets[SHA_A] = imageAsset(SHA_A);
    delete doc.env.hdri;
    expect(() => validateDoc(doc)).not.toThrow();
  });
});
