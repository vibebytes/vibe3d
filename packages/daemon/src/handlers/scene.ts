import {
  type Geometry,
  type LightSpec,
  type Material,
  type NodePatch,
  type Op,
  type SceneNode,
  type Transform,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import type { HandlersFor } from './types';

type Keys = 'node.create' | 'node.update' | 'node.delete' | 'stage.set' | 'animation.play' | 'camera.set';

const IDENTITY: Transform = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] };

function mergeTransform(input?: {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
}): Transform {
  return {
    p: input?.p ?? IDENTITY.p,
    r: input?.r ?? IDENTITY.r,
    s: input?.s ?? IDENTITY.s,
  };
}

function colorToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

function geometryOf(p: {
  shape?: 'box' | 'sphere' | 'cylinder' | 'plane';
  size?: [number, number, number];
  radius?: number;
  height?: number;
}): Geometry {
  const shape = p.shape ?? 'box';
  if (shape === 'sphere') return { type: 'sphere', radius: p.radius ?? 0.5, segments: 48 };
  if (shape === 'cylinder') {
    const r = p.radius ?? 0.5;
    return { type: 'cylinder', radiusTop: r, radiusBottom: r, height: p.height ?? 1, segments: 48 };
  }
  if (shape === 'plane') {
    const size = p.size ?? [1, 1, 1];
    return { type: 'plane', width: size[0], height: size[1] };
  }
  return { type: 'box', size: p.size ?? [1, 1, 1] };
}

function materialOf(p: { color?: string; material?: Material }): Material {
  if (p.material) return p.material;
  return {
    baseColor: colorToRgba(p.color ?? '#c8d3df'),
    metalness: 0.1,
    roughness: 0.55,
    emissive: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 1,
    doubleSided: false,
  };
}

export const sceneHandlers: HandlersFor<Keys> = {
  'node.create': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const id = makeNodeId();
    const base = {
      id,
      name: p.name ?? `${p.kind}-${id.slice(2, 6)}`,
      parent: p.parent ?? null,
      visible: true,
      transform: mergeTransform(p.transform),
    };

    const ops: Op[] = [];
    let node: SceneNode;
    if (p.kind === 'group') {
      node = { ...base, kind: 'group' };
    } else if (p.kind === 'light') {
      const light: LightSpec = p.light ?? {
        type: 'directional',
        color: [1, 1, 1, 1],
        intensity: 2,
        position: [3, 4, 5],
        castShadow: true,
      };
      node = { ...base, kind: 'light', light };
    } else {
      const materialId = makeMaterialId();
      const material = materialOf({ color: p.color, material: p.material });
      ops.push({ op: 'material.set', id: materialId, material });
      node = { ...base, kind: 'mesh', geometry: geometryOf(p), material: materialId };
    }
    ops.push({ op: 'node.create', node });

    const result = await room.run(() => room.apply(ops));
    return { nodeId: id, revision: result.revision };
  },

  'node.update': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const patch: NodePatch = {};
    if (p.patch.name !== undefined) patch.name = p.patch.name;
    if (p.patch.visible !== undefined) patch.visible = p.patch.visible;
    if (p.patch.light !== undefined) patch.light = p.patch.light;
    if (p.patch.anim !== undefined) patch.anim = p.patch.anim;
    if (p.patch.transform) {
      const current = room.doc.nodes[p.nodeId]?.transform ?? IDENTITY;
      patch.transform = {
        p: p.patch.transform.p ?? current.p,
        r: p.patch.transform.r ?? current.r,
        s: p.patch.transform.s ?? current.s,
      };
    }
    const result = await room.run(() => room.apply([{ op: 'node.update', id: p.nodeId, patch }]));
    return { revision: result.revision };
  },

  'node.delete': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const before = Object.keys(room.doc.nodes).length;
    const result = await room.run(() =>
      room.apply([{ op: 'node.delete', id: p.nodeId, cascade: p.cascade ?? true }]),
    );
    const after = Object.keys(room.doc.nodes).length;
    return { revision: result.revision, deleted: Math.max(1, before - after) };
  },

  'stage.set': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const result = await room.run(() => room.apply([{ op: 'stage.set', stage: p.stage }]));
    return { revision: result.revision, stage: room.doc.stage };
  },

  'animation.play': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const op: Op = { op: 'animation.play', target: p.nodeId, clip: p.clip, speed: p.speed };
    const result = await room.run(() => room.apply([op]));
    return { revision: result.revision };
  },

  'camera.set': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const op: Op = { op: 'camera.set', camera: p.camera, frame: p.frame };
    const result = await room.run(() => room.apply([op]));
    return { revision: result.revision, camera: room.doc.camera };
  },
};
