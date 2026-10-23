import { type Material, type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';

export const CUBE: SceneNode = {
  id: 'n_00000001',
  kind: 'mesh',
  name: '立方体',
  parent: null,
  visible: true,
  transform: { p: [0, 0.5, 0], r: [0, 0, 0], s: [1, 1, 1] },
  geometry: { type: 'box', size: [1, 1, 1] },
  material: 'm_00000001',
};

export const MAT: Material = {
  baseColor: [0.8, 0.8, 0.82, 1],
  metalness: 0.1,
  roughness: 0.6,
  emissive: [0, 0, 0],
  emissiveIntensity: 1,
  opacity: 1,
  doubleSided: false,
};

export function cubeDoc(): SceneDoc {
  const doc = emptyDoc('test');
  doc.nodes[CUBE.id] = structuredClone(CUBE);
  doc.roots = [CUBE.id];
  doc.materials['m_00000001'] = structuredClone(MAT);
  return doc;
}

export function modelNode(id: `n_${string}`, sha: string, parent: `n_${string}` | null = null): SceneNode {
  return {
    id,
    kind: 'model',
    name: '模型',
    parent,
    visible: true,
    transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    sha,
  };
}

export const SHA_A = 'a'.repeat(64);
export const SHA_B = 'b'.repeat(64);
