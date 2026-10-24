import {
  AppError,
  type Material,
  type Op,
  type SceneNode,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import type { HandlersFor } from './types';

type Keys = 'decal.create';

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.slice(1);
  const n = Number.parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

const DECAL_MATERIAL: Material = {
  baseColor: [1, 1, 1, 1],
  metalness: 0,
  roughness: 0.9,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: true,
};

export const decalHandlers: HandlersFor<Keys> = {
  'decal.create': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (Boolean(p.text) === Boolean(p.imageSha)) {
      throw new AppError('E_INVALID_PARAMS', 'decal.create 需要且只能给出 text 或 imageSha');
    }
    if (p.imageSha) {
      const asset = room.doc.assets[p.imageSha];
      if (!asset) throw new AppError('E_ASSET_MISSING', `资产未注册：${p.imageSha}`, { sha: p.imageSha });
      if (asset.kind !== 'image') {
        throw new AppError('E_ASSET_TYPE', `贴花图片必须是 image 资产：${asset.name}`, { sha: p.imageSha });
      }
    }
    if (p.parent && !room.doc.nodes[p.parent]) {
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    }

    const nodeId = p.id ?? makeNodeId();
    if (room.doc.nodes[nodeId]) throw new AppError('E_INVALID_PARAMS', `节点已存在：${nodeId}`);
    const materialId = makeMaterialId();

    const decal = {
      ...(p.text ? { text: p.text } : {}),
      ...(p.imageSha ? { imageSha: p.imageSha } : {}),
      color: hexToRgba(p.color ?? '#ffffff'),
      ...(p.background ? { background: hexToRgba(p.background) } : {}),
      ...(p.fontSize ? { fontSize: p.fontSize } : {}),
      ...(p.bold !== undefined ? { bold: p.bold } : {}),
      ...(p.align ? { align: p.align } : {}),
    };

    const node: SceneNode = {
      id: nodeId,
      kind: 'mesh',
      name: p.name ?? (p.text ? `decal:${p.text.slice(0, 24)}` : 'decal'),
      parent: p.parent ?? null,
      visible: true,
      transform: { p: p.position, r: p.rotation ?? [0, 0, 0], s: [1, 1, 1] },
      geometry: { type: 'plane', width: p.width, height: p.height },
      material: materialId,
      decal,
    };

    const ops: Op[] = [
      { op: 'material.set', id: materialId, material: DECAL_MATERIAL },
      { op: 'node.create', node },
    ];
    const result = await room.run(() => room.apply(ops));
    return { nodeId, materialId, revision: result.revision };
  },
};
