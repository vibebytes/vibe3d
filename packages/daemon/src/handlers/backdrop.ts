import {
  AppError,
  type Material,
  type Op,
  type SceneNode,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import { backdropSweep } from '@vibebyte/vibe3d-scene';
import type { HandlersFor } from './types';

type Keys = 'mesh.backdrop';

const MAX_GEOMETRY = 300_000;

function hexToRgb(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

export const backdropHandlers: HandlersFor<Keys> = {
  'mesh.backdrop': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent]) {
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`, { nodeId: p.parent });
    }
    const mesh = backdropSweep({
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.depth !== undefined ? { depth: p.depth } : {}),
      ...(p.height !== undefined ? { height: p.height } : {}),
      ...(p.curve !== undefined ? { curve: p.curve } : {}),
      ...(p.segments !== undefined ? { segments: p.segments } : {}),
    });
    if (mesh.positions.length > MAX_GEOMETRY || mesh.indices.length > MAX_GEOMETRY) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', '背板几何过大，降低 segments', {
        positions: mesh.positions.length,
        indices: mesh.indices.length,
      });
    }

    const nodeId = makeNodeId();
    const materialId = makeMaterialId();
    const t = p.transform ?? {};
    const material: Material = {
      baseColor: hexToRgb(p.color ?? '#dbdbdb'),
      metalness: 0,
      roughness: 1,
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      opacity: 1,
      doubleSided: false,
    };
    const node: SceneNode = {
      id: nodeId,
      kind: 'mesh',
      name: p.name ?? 'backdrop',
      parent: p.parent ?? null,
      visible: true,
      transform: { p: t.p ?? [0, 0, 0], r: t.r ?? [0, 0, 0], s: t.s ?? [1, 1, 1] },
      geometry: {
        type: 'baked',
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
        bbox: mesh.bbox,
      },
      material: materialId,
    };

    const ops: Op[] = [
      { op: 'material.set', id: materialId, material },
      { op: 'node.create', node },
    ];
    const result = await room.run(() => room.apply(ops));
    return {
      nodeId,
      materialId,
      revision: result.revision,
      tris: mesh.indices.length / 3,
      vertices: mesh.positions.length / 3,
    };
  },
};
