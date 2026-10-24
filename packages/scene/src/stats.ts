import type { Geometry, SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';

export interface SceneStats {
  nodes: number;
  byKind: Partial<Record<SceneNode['kind'], number>>;
  meshes: number;
  tris: number;
  materials: number;
  textures: number;
  drawCallsEst: number;
}

export function geometryTris(geometry: Geometry): number {
  switch (geometry.type) {
    case 'box':
      return 12;
    case 'plane':
      return 2;
    case 'sphere':
      return geometry.segments * geometry.segments * 2;
    case 'cylinder':
      return geometry.segments * 4;
    case 'baked':
      return geometry.indices.length / 3;
  }
}

export function sceneStats(doc: SceneDoc): SceneStats {
  const byKind: SceneStats['byKind'] = {};
  const used = new Set<string>();
  let meshes = 0;
  let tris = 0;
  let drawCallsEst = 0;

  for (const node of Object.values(doc.nodes)) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    if (node.kind === 'mesh') {
      meshes += 1;
      tris += geometryTris(node.geometry);
      used.add(node.material);
      if (node.visible) drawCallsEst += 1;
    } else if (node.kind === 'model') {
      tris += doc.assets[node.sha]?.gltf?.tris ?? 0;
      if (node.visible) drawCallsEst += 1;
    }
  }

  let textures = 0;
  for (const id of used) {
    if (doc.materials[id]?.map) textures += 1;
  }

  return {
    nodes: Object.keys(doc.nodes).length,
    byKind,
    meshes,
    tris,
    materials: Object.keys(doc.materials).length,
    textures,
    drawCallsEst,
  };
}
