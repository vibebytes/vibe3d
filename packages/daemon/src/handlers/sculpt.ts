import {
  AppError,
  type Material,
  type Op,
  type SceneNode,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import {
  type SculptMesh,
  bevelMesh,
  latheMesh,
  mannequinMesh,
  organicMesh,
  treeMesh,
} from '@vibebyte/vibe3d-scene';
import type { DispatchContext } from '../context';
import type { HandlersFor } from './types';

type Keys = 'mesh.lathe' | 'mesh.organic' | 'mesh.bevel' | 'mesh.tree' | 'mesh.mannequin';

const MAX_GEOMETRY = 300_000;

function hexToRgb(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

async function place(
  ctx: DispatchContext,
  roomId: string,
  name: string,
  parent: string | null,
  transform:
    | { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] }
    | undefined,
  color: string | undefined,
  mesh: SculptMesh,
) {
  if (mesh.positions.length > MAX_GEOMETRY || mesh.indices.length > MAX_GEOMETRY) {
    throw new AppError('E_PAYLOAD_TOO_LARGE', '几何过大', {
      positions: mesh.positions.length,
      indices: mesh.indices.length,
    });
  }
  const room = ctx.rooms.get(roomId);
  const nodeId = makeNodeId();
  const materialId = makeMaterialId();
  const t = transform ?? {};
  const material: Material = {
    baseColor: hexToRgb(color ?? '#c8d3df'),
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
    name,
    parent,
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
  const result = await room.run(() =>
    room.apply([
      { op: 'material.set', id: materialId, material },
      { op: 'node.create', node },
    ]),
  );
  return {
    nodeId,
    materialId,
    revision: result.revision,
    tris: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
  };
}

export const sculptHandlers: HandlersFor<Keys> = {
  'mesh.lathe': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent])
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    return place(
      ctx,
      p.roomId,
      p.name ?? 'lathe',
      p.parent ?? null,
      p.transform,
      p.color,
      latheMesh({
        profile: p.profile,
        ...(p.segments !== undefined ? { segments: p.segments } : {}),
      }),
    );
  },
  'mesh.organic': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent])
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    return place(
      ctx,
      p.roomId,
      p.name ?? 'organic',
      p.parent ?? null,
      p.transform,
      p.color,
      organicMesh({
        radius: p.radius,
        seed: p.seed,
        ...(p.amplitude !== undefined ? { amplitude: p.amplitude } : {}),
        ...(p.segments !== undefined ? { segments: p.segments } : {}),
        ...(p.flatBottom !== undefined ? { flatBottom: p.flatBottom } : {}),
      }),
    );
  },
  'mesh.bevel': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent])
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    return place(
      ctx,
      p.roomId,
      p.name ?? 'bevel',
      p.parent ?? null,
      p.transform,
      p.color,
      bevelMesh({
        size: p.size,
        radius: p.radius,
        ...(p.segments !== undefined ? { segments: p.segments } : {}),
      }),
    );
  },
  'mesh.tree': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent])
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    return place(
      ctx,
      p.roomId,
      p.name ?? 'tree',
      p.parent ?? null,
      p.transform,
      p.color,
      treeMesh({
        height: p.height,
        spread: p.spread,
        levels: p.levels,
        seed: p.seed,
        ...(p.style !== undefined ? { style: p.style } : {}),
      }),
    );
  },
  'mesh.mannequin': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.parent && !room.doc.nodes[p.parent])
      throw new AppError('E_NODE_NOT_FOUND', `父节点 ${p.parent} 不存在`);
    const fig = mannequinMesh({
      pose: p.pose ?? 'jog_away',
      ...(p.seed !== undefined ? { seed: p.seed } : {}),
    });
    const bodyId = makeNodeId();
    const clothId = makeNodeId();
    const bodyMat = makeMaterialId();
    const clothMat = makeMaterialId();
    const paint = (hex: string): Material => ({
      baseColor: hexToRgb(hex),
      metalness: 0.05,
      roughness: 0.6,
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      opacity: 1,
      doubleSided: false,
    });
    const t = p.transform ?? {};
    const node = (id: string, name: string, material: string, mesh: SculptMesh): SceneNode => ({
      id,
      kind: 'mesh',
      name,
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
      material,
    });
    const result = await room.run(() =>
      room.apply([
        { op: 'material.set', id: bodyMat, material: paint('#d7c4a8') },
        { op: 'material.set', id: clothMat, material: paint('#8aa0b8') },
        { op: 'node.create', node: node(bodyId, p.name ?? 'body', bodyMat, fig.body) },
        { op: 'node.create', node: node(clothId, `${p.name ?? 'body'}-cloth`, clothMat, fig.cloth) },
      ]),
    );
    return {
      nodeId: bodyId,
      clothNodeId: clothId,
      materialId: bodyMat,
      clothMaterialId: clothMat,
      revision: result.revision,
    };
  },
};
