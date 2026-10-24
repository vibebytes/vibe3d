import {
  AppError,
  type Material,
  type Op,
  type SceneNode,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import { tubeMesh } from '@vibebyte/vibe3d-scene';
import type { HandlersFor } from './types';

type Keys = 'mesh.tube';

const MAX_GEOMETRY = 300_000;

function hexToRgb(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

export const tubeHandlers: HandlersFor<Keys> = {
  'mesh.tube': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent]) {
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`, { nodeId: p.parent });
    }
    const mesh = tubeMesh({
      points: p.points,
      radius: p.radius,
      ...(p.radiusEnd !== undefined ? { radiusEnd: p.radiusEnd } : {}),
      ...(p.segments !== undefined ? { segments: p.segments } : {}),
      ...(p.radialSegments !== undefined ? { radialSegments: p.radialSegments } : {}),
      ...(p.closed !== undefined ? { closed: p.closed } : {}),
    });
    if (mesh.positions.length > MAX_GEOMETRY || mesh.indices.length > MAX_GEOMETRY) {
      throw new AppError('E_PAYLOAD_TOO_LARGE', '管体几何过大，降低 segments / radialSegments', {
        positions: mesh.positions.length,
        indices: mesh.indices.length,
      });
    }

    const nodeId = makeNodeId();
    const materialId = makeMaterialId();
    const t = p.transform ?? {};
    const material: Material = {
      baseColor: hexToRgb(p.color ?? '#c8d3df'),
      metalness: 0.1,
      roughness: 0.55,
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      opacity: 1,
      doubleSided: false,
    };
    const node: SceneNode = {
      id: nodeId,
      kind: 'mesh',
      name: p.name ?? 'tube',
      parent: p.parent ?? null,
      visible: true,
      transform: { p: t.p ?? [0, 0, 0], r: t.r ?? [0, 0, 0], s: t.s ?? [1, 1, 1] },
      geometry: { type: 'baked', positions: mesh.positions, indices: mesh.indices, bbox: mesh.bbox },
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
