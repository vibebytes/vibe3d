import {
  AppError,
  type FxSpec,
  type Geometry,
  type LightSpec,
  type Material,
  type NodePatch,
  type Op,
  type SceneDoc,
  type SceneNode,
  type Transform,
  makeFxId,
  makeMaterialId,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import {
  DEFAULT_LIMITS,
  type NodeFilter,
  arrayPlacements,
  attachDelta,
  checkBudget,
  clipChannelOf,
  frameTarget,
  mergeGroup,
  nodeBounds,
  nodeClipsOf,
  nodeOwnBounds,
  nodeView,
  pickNode,
  queryNodes,
  relativeTransform,
  resolveMaterialPreset,
  sceneStats,
  subtreeIds,
  validateScene,
  worldMatrix,
  worldPointToLocal,
} from '@vibebyte/vibe3d-scene';
import type { HandlersFor } from './types';

type Keys =
  | 'node.create'
  | 'node.update'
  | 'node.delete'
  | 'node.clone'
  | 'node.transform_many'
  | 'node.array'
  | 'node.attach'
  | 'node.reparent'
  | 'node.group'
  | 'node.merge'
  | 'material.assign'
  | 'material.create'
  | 'material.patch'
  | 'material.map'
  | 'scene.query'
  | 'node.get'
  | 'scene.validate'
  | 'scene.stats'
  | 'scene.pick'
  | 'stage.set'
  | 'animation.play'
  | 'animation.stop'
  | 'animation.define'
  | 'animation.clear'
  | 'animation.pose'
  | 'fx.create'
  | 'fx.delete'
  | 'env.set'
  | 'camera.set'
  | 'camera.save'
  | 'camera.delete';

const IDENTITY: Transform = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] };
const MAX_FX = 64;

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
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
}): Geometry {
  const shape = p.shape ?? 'box';
  if (shape === 'sphere') return { type: 'sphere', radius: p.radius ?? 0.5, segments: 48 };
  if (shape === 'cylinder') {
    const radiusTop = p.radiusTop ?? p.radius ?? 0.5;
    const radiusBottom = p.radiusBottom ?? p.radius ?? 0.5;
    return { type: 'cylinder', radiusTop, radiusBottom, height: p.height ?? 1, segments: 48 };
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

function pickTargets(doc: SceneDoc, ids?: readonly string[], filter?: NodeFilter): string[] {
  if (ids && ids.length > 0 && filter) {
    throw new AppError('E_INVALID_PARAMS', 'ids 与 filter 只能二选一');
  }
  if (ids && ids.length > 0) {
    for (const id of ids) {
      if (!doc.nodes[id]) throw new AppError('E_NODE_NOT_FOUND', `节点 ${id} 不存在`);
    }
    return [...new Set(ids)];
  }
  if (filter) return queryNodes(doc, { ...filter, limit: 500 }).nodes.map((node) => node.id);
  throw new AppError('E_INVALID_PARAMS', '需要 ids 或 filter');
}

function uniqueName(doc: SceneDoc, parent: string | null, base: string, taken: Set<string>): string {
  const used = new Set(taken);
  for (const node of Object.values(doc.nodes)) {
    if (node.parent === parent) used.add(node.name);
  }
  if (!used.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  const name = `${base} ${n}`;
  taken.add(name);
  return name;
}

type Vec = [number, number, number];

function applyDelta(t: Transform, delta: { translate?: Vec; rotate?: Vec; scale?: Vec }): Transform {
  const [sx, sy, sz] = delta.scale ?? [1, 1, 1];
  const [dx, dy, dz] = delta.translate ?? [0, 0, 0];
  const [rx, ry, rz] = delta.rotate ?? [0, 0, 0];
  return {
    p: [t.p[0] + dx, t.p[1] + dy, t.p[2] + dz],
    r: [t.r[0] + rx, t.r[1] + ry, t.r[2] + rz],
    s: [t.s[0] * sx, t.s[1] * sy, t.s[2] * sz],
  };
}

export const sceneHandlers: HandlersFor<Keys> = {
  'scene.query': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return queryNodes(room.doc, p);
  },
  'node.get': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const view = nodeView(room.doc, p.nodeId);
    if (!view) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.nodeId} 不存在`);
    return view;
  },
  'scene.stats': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const stats = sceneStats(room.doc);
    if (!p.budget) return stats;
    const report = checkBudget(stats, p.budget);
    if (p.enforce && report.over.length > 0) {
      throw new AppError('E_BUDGET_EXCEEDED', undefined, {
        over: report.over,
        metrics: report.metrics,
        hint: report.hint,
      });
    }
    return { ...stats, budget: report };
  },
  'scene.pick': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return pickNode(room.doc, {
      point: p.point,
      width: p.width,
      height: p.height,
      camera: p.camera,
      ray: p.ray,
      maxDistance: p.maxDistance,
      tolerance: p.tolerance,
      limit: p.limit,
    });
  },
  'scene.validate': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return validateScene(room.doc, {
      checks: p.checks,
      tolerance: p.tolerance,
      ignore: p.ignore,
      bounds: p.bounds,
      groundY: p.groundY,
      semantics: p.semantics,
    });
  },
  'node.transform_many': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const ids = pickTargets(room.doc, p.ids, p.filter);
    const ops: Op[] = [];
    for (const id of ids) {
      const node = room.doc.nodes[id];
      if (!node) continue;
      ops.push({
        op: 'node.update',
        id,
        patch: {
          transform: applyDelta(node.transform, {
            translate: p.translate,
            rotate: p.rotate,
            scale: p.scale,
          }),
        },
      });
    }
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision, applied: ops.length };
  },
  'node.array': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const source = room.doc.nodes[p.id];
    if (!source) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.id} 不存在`);
    const total = Object.keys(room.doc.nodes).length + p.count;
    if (total > DEFAULT_LIMITS.maxNodes) {
      throw new AppError('E_LIMIT_EXCEEDED', `阵列后节点数 ${total} 超过上限 ${DEFAULT_LIMITS.maxNodes}`, {
        total,
        limit: DEFAULT_LIMITS.maxNodes,
      });
    }
    const placements = arrayPlacements(source.transform, {
      mode: p.mode,
      count: p.count,
      offset: p.offset,
      jitter: p.jitter,
      rotateStep: p.rotateStep,
      cols: p.cols,
      radius: p.radius,
      sweep: p.sweep,
      axis: p.axis,
      center: p.center,
    });
    const taken = new Set<string>();
    const ops: Op[] = [];
    const nodeIds: string[] = [];
    for (const placement of placements) {
      const node = structuredClone(source);
      node.id = makeNodeId();
      node.name = uniqueName(room.doc, node.parent, source.name, taken);
      node.transform = applyDelta(source.transform, placement);
      ops.push({ op: 'node.create', node });
      nodeIds.push(node.id);
    }
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision, nodeIds };
  },
  'node.attach': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const node = room.doc.nodes[p.id];
    if (!node) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.id} 不存在`);
    if (!room.doc.nodes[p.targetId]) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.targetId} 不存在`);
    const delta = attachDelta(room.doc, p.id, p.targetId, { face: p.face, corner: p.corner, offset: p.gap });
    if (!delta) {
      throw new AppError('E_UNSUPPORTED', `节点 ${p.id} 不可见或缺少可吸附的包围盒`, {
        id: p.id,
        targetId: p.targetId,
      });
    }
    const m = worldMatrix(room.doc, p.id);
    const world: Vec = [(m?.[12] ?? 0) + delta[0], (m?.[13] ?? 0) + delta[1], (m?.[14] ?? 0) + delta[2]];
    const local = worldPointToLocal(room.doc, node.parent, world);
    const out = await room.run(() =>
      room.apply([{ op: 'node.update', id: p.id, patch: { transform: { ...node.transform, p: local } } }]),
    );
    const box = nodeOwnBounds(room.doc, p.id) ?? nodeBounds(room.doc, p.id);
    return {
      revision: out.revision,
      nodeId: p.id,
      box: { min: [...(box?.min ?? local)], max: [...(box?.max ?? local)] },
    };
  },
  'node.reparent': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const node = room.doc.nodes[p.id];
    if (!node) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.id} 不存在`);
    if (p.parent !== null && !room.doc.nodes[p.parent]) {
      throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.parent} 不存在`);
    }
    const transform = (p.keepWorld ?? true) ? relativeTransform(room.doc, p.id, p.parent) : null;
    const ops: Op[] = [
      {
        op: 'node.reparent',
        id: p.id,
        parent: p.parent,
        ...(p.index === undefined ? {} : { index: p.index }),
      },
    ];
    if (transform) ops.push({ op: 'node.update', id: p.id, patch: { transform } });
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision };
  },
  'node.group': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const ids = [...new Set(p.ids)];
    if (ids.length === 0) throw new AppError('E_INVALID_PARAMS', 'ids 不能为空');
    const headId = ids[0];
    const head = headId ? room.doc.nodes[headId] : undefined;
    if (!headId || !head) throw new AppError('E_NODE_NOT_FOUND', `节点 ${headId ?? ''} 不存在`);
    const parent = head.parent;
    for (const id of ids) {
      const node = room.doc.nodes[id];
      if (!node) throw new AppError('E_NODE_NOT_FOUND', `节点 ${id} 不存在`);
      if (node.parent !== parent) {
        throw new AppError('E_INVALID_PARAMS', '同组节点必须共享同一父节点', { id });
      }
    }
    if (parent && ids.includes(parent)) {
      throw new AppError('E_INVALID_PARAMS', '不能把父节点编入它自己的组');
    }

    let min: Vec = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    let max: Vec = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const id of ids) {
      const box = nodeBounds(room.doc, id);
      if (!box) continue;
      min = [Math.min(min[0], box.min[0]), Math.min(min[1], box.min[1]), Math.min(min[2], box.min[2])];
      max = [Math.max(max[0], box.max[0]), Math.max(max[1], box.max[1]), Math.max(max[2], box.max[2])];
    }
    const center: Vec = Number.isFinite(min[0])
      ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
      : [0, 0, 0];

    const pivot = worldPointToLocal(room.doc, parent, center);
    const groupId = makeNodeId();
    const group: SceneNode = {
      id: groupId,
      name: uniqueName(room.doc, parent, p.name, new Set()),
      parent,
      visible: true,
      transform: { p: pivot, r: [0, 0, 0], s: [1, 1, 1] },
      kind: 'group',
    };
    const ops: Op[] = [{ op: 'node.create', node: group }];
    for (const id of ids) {
      const node = room.doc.nodes[id];
      if (!node) continue;
      ops.push({ op: 'node.reparent', id, parent: groupId });
      if (p.keepWorld ?? true) {
        ops.push({
          op: 'node.update',
          id,
          patch: {
            transform: {
              ...node.transform,
              p: [
                node.transform.p[0] - pivot[0],
                node.transform.p[1] - pivot[1],
                node.transform.p[2] - pivot[2],
              ],
            },
          },
        });
      }
    }
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision, groupId };
  },
  'node.merge': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const group = room.doc.nodes[p.nodeId];
    const plan = mergeGroup(room.doc, { nodeId: p.nodeId, material: p.material });
    const nodeId = makeNodeId();
    const merged: SceneNode = {
      id: nodeId,
      name: group?.name ?? p.nodeId,
      parent: group?.parent ?? null,
      visible: group?.visible ?? true,
      transform: group?.transform ?? { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      kind: 'mesh',
      geometry: {
        type: 'baked',
        positions: plan.positions,
        normals: plan.normals,
        indices: plan.indices,
        bbox: plan.bbox,
      },
      material: plan.material,
    };
    const ops: Op[] = [
      { op: 'node.create', node: merged },
      { op: 'node.delete', id: p.nodeId, cascade: true },
    ];
    const result = await room.run(() => room.apply(ops));
    return {
      revision: result.revision,
      nodeId,
      sources: plan.sources,
      tris: plan.tris,
      vertices: plan.vertices,
    };
  },
  'material.assign': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.materials[p.materialId]) {
      throw new AppError('E_INVALID_PARAMS', `材质 ${p.materialId} 不存在`);
    }
    const ids = pickTargets(room.doc, p.ids, p.filter).filter((id) => room.doc.nodes[id]?.kind === 'mesh');
    const ops: Op[] = ids.map((id) => ({
      op: 'node.update',
      id,
      patch: { material: p.materialId },
    }));
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision, applied: ids.length };
  },
  'node.create': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const id = makeNodeId();
    const base = {
      id,
      name: p.name ?? `${p.kind}-${id.slice(2, 6)}`,
      parent: p.parent ?? null,
      visible: true,
      transform: mergeTransform(p.transform),
      ...(p.tags === undefined ? {} : { tags: [...p.tags] }),
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
    return { nodeId: id, revision: result.revision, ...(p.tags === undefined ? {} : { tags: [...p.tags] }) };
  },

  'node.update': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const patch: NodePatch = {};
    if (p.patch.name !== undefined) patch.name = p.patch.name;
    if (p.patch.visible !== undefined) patch.visible = p.patch.visible;
    if (p.patch.light !== undefined) patch.light = p.patch.light;
    if (p.patch.anim !== undefined) patch.anim = p.patch.anim;
    if (p.patch.tags !== undefined) patch.tags = p.patch.tags;
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

  'node.clone': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const source = room.doc.nodes[p.nodeId];
    if (!source) throw new AppError('E_INVALID_PARAMS', '节点不存在', { id: p.nodeId });
    const targetParent = p.parent === undefined ? source.parent : p.parent;
    if (targetParent && !room.doc.nodes[targetParent]) {
      throw new AppError('E_INVALID_PARAMS', '父节点不存在', { id: targetParent });
    }

    const children = new Map<string, string[]>();
    for (const node of Object.values(room.doc.nodes)) {
      if (!node.parent) continue;
      const list = children.get(node.parent);
      if (list) list.push(node.id);
      else children.set(node.parent, [node.id]);
    }
    const order: string[] = [];
    const queue = [p.nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      queue.push(...(children.get(id) ?? []));
    }
    if (targetParent && order.includes(targetParent)) {
      throw new AppError('E_INVALID_PARAMS', '不能把子树克隆到自身内部', { id: targetParent });
    }

    const count = p.count ?? 1;
    const total = Object.keys(room.doc.nodes).length + order.length * count;
    if (total > DEFAULT_LIMITS.maxNodes) {
      throw new AppError('E_LIMIT_EXCEEDED', `克隆后节点数 ${total} 超过上限 ${DEFAULT_LIMITS.maxNodes}`, {
        total,
        limit: DEFAULT_LIMITS.maxNodes,
      });
    }

    const siblings = new Map<string, Set<string>>();
    const siblingNames = (parent: string | null): Set<string> => {
      const key = parent ?? '\u0000root';
      let set = siblings.get(key);
      if (!set) {
        set = new Set<string>();
        for (const node of Object.values(room.doc.nodes)) {
          if (node.parent === parent) set.add(node.name);
        }
        siblings.set(key, set);
      }
      return set;
    };
    const uniqueName = (parent: string | null, base: string): string => {
      const set = siblingNames(parent);
      if (!set.has(base)) {
        set.add(base);
        return base;
      }
      let n = 2;
      while (set.has(`${base} ${n}`)) n += 1;
      const name = `${base} ${n}`;
      set.add(name);
      return name;
    };

    const ops: Op[] = [];
    const nodeIds: string[] = [];
    for (let copy = 0; copy < count; copy += 1) {
      const remap = new Map(order.map((id) => [id, makeNodeId()]));
      for (const oldId of order) {
        const node = room.doc.nodes[oldId];
        if (!node) throw new AppError('E_INVALID_PARAMS', '节点不存在', { id: oldId });
        const isRoot = oldId === p.nodeId;
        const parent = isRoot ? targetParent : remap.get(node.parent!)!;
        const cloned: SceneNode = structuredClone(node);
        cloned.id = remap.get(oldId)!;
        cloned.parent = parent;
        cloned.name = uniqueName(parent, node.name);
        if (isRoot && p.transform) {
          cloned.transform = {
            p: p.transform.p ?? node.transform.p,
            r: p.transform.r ?? node.transform.r,
            s: p.transform.s ?? node.transform.s,
          };
        }
        ops.push({ op: 'node.create', node: cloned });
      }
      nodeIds.push(remap.get(p.nodeId)!);
    }

    const result = await room.run(() => room.apply(ops));
    return { nodeIds, revision: result.revision };
  },

  'stage.set': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const result = await room.run(() => room.apply([{ op: 'stage.set', stage: p.stage }]));
    return { revision: result.revision, stage: room.doc.stage };
  },

  'animation.play': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const op: Op = {
      op: 'animation.play',
      target: p.nodeId,
      clip: p.clip,
      speed: p.speed,
      loop: p.loop,
      direction: p.direction,
      weight: p.weight,
    };
    const result = await room.run(() => room.apply([op]));
    return { revision: result.revision };
  },

  'animation.stop': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const result = await room.run(() => room.apply([{ op: 'animation.stop', target: p.nodeId }]));
    return { revision: result.revision };
  },

  'animation.define': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.nodes[p.nodeId]) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.nodeId} 不存在`);
    const appliedTo = p.applyTo === 'subtree' ? subtreeIds(room.doc, p.nodeId) : [p.nodeId];
    const result = await room.run(() =>
      room.apply([{ op: 'animation.define', target: p.nodeId, clip: p.clip, applyTo: p.applyTo }]),
    );
    return { revision: result.revision, nodeId: p.nodeId, appliedTo };
  },

  'animation.clear': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.nodes[p.nodeId]) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.nodeId} 不存在`);
    const ids = p.applyTo === 'subtree' ? subtreeIds(room.doc, p.nodeId) : [p.nodeId];
    const appliedTo = ids.filter((id) => {
      const node = room.doc.nodes[id];
      if (!node) return false;
      if (!p.channel) return nodeClipsOf(node).length > 0;
      return nodeClipsOf(node).some((clip) => clipChannelOf(clip) === p.channel);
    });
    const result = await room.run(() =>
      room.apply([{ op: 'animation.clear', target: p.nodeId, applyTo: p.applyTo, channel: p.channel }]),
    );
    return { revision: result.revision, cleared: appliedTo.length > 0, appliedTo };
  },

  'animation.pose': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    for (const target of p.targets) {
      if (!room.doc.nodes[target.nodeId])
        throw new AppError('E_NODE_NOT_FOUND', `节点 ${target.nodeId} 不存在`);
    }
    const result = await room.run(() =>
      room.apply([{ op: 'animation.pose', targets: p.targets.map((t) => ({ nodeId: t.nodeId, clip: t.clip })) }]),
    );
    return { revision: result.revision, appliedTo: p.targets.map((t) => t.nodeId) };
  },

  'fx.create': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (room.doc.fx.length >= MAX_FX) {
      throw new AppError('E_LIMIT_EXCEEDED', `特效数量上限 ${MAX_FX}`, { limit: MAX_FX });
    }
    if (p.nodeId && !room.doc.nodes[p.nodeId]) {
      throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.nodeId} 不存在`);
    }
    const { roomId: _roomId, ...spec } = p;
    const fx: FxSpec = { id: makeFxId(), ...spec };
    const result = await room.run(() => room.apply([{ op: 'fx.create', fx }]));
    return {
      revision: result.revision,
      fxId: fx.id,
      ...(fx.type === 'shaft' ? { approximate: true } : {}),
    };
  },

  'fx.delete': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const existed = room.doc.fx.some((f) => f.id === p.fxId);
    const result = await room.run(() => room.apply([{ op: 'fx.delete', id: p.fxId }]));
    return { revision: result.revision, removed: existed };
  },

  'env.set': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const { roomId: _roomId, hdriSrc, policy, fog, ...rest } = p;
    const env = { ...rest, ...(fog === undefined ? {} : { fog: fog === false ? null : fog }) };
    const ops: Op[] = [];
    if (hdriSrc) {
      const { meta } = await ctx.ingest(hdriSrc, policy, { hdri: true });
      if (meta.kind !== 'image') {
        throw new AppError('E_ASSET_TYPE', `hdriSrc 只接受图片：${meta.name}`, {
          sha: meta.sha,
        });
      }
      ops.push({ op: 'asset.register', asset: meta });
      env.hdri = meta.sha;
    }
    ops.push({ op: 'env.set', env } as Op);
    const result = await room.run(() => room.apply(ops));
    return { revision: result.revision, env: room.doc.env, ...(env.hdri ? { sha: env.hdri } : {}) };
  },

  'material.create': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const materialId = makeMaterialId();
    const resolved = resolveMaterialPreset(p.preset, p.params);
    const result = await room.run(() =>
      room.apply([
        { op: 'material.create', id: materialId, preset: resolved.preset, params: resolved.params },
      ]),
    );
    return {
      revision: result.revision,
      materialId,
      preset: resolved.preset,
      ...(resolved.note ? { presetNote: resolved.note } : {}),
    };
  },

  'material.patch': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.materials[p.materialId]) {
      throw new AppError('E_MATERIAL_NOT_FOUND', `材质 ${p.materialId} 不存在`);
    }
    const result = await room.run(() =>
      room.apply([{ op: 'material.patch', id: p.materialId, patch: p.patch }]),
    );
    return { revision: result.revision, materialId: p.materialId };
  },

  'material.map': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.materials[p.materialId]) {
      throw new AppError('E_MATERIAL_NOT_FOUND', `材质 ${p.materialId} 不存在`);
    }
    const { roomId: _roomId, materialId, ...map } = p;
    const result = await room.run(() => room.apply([{ op: 'material.map', id: materialId, map }]));
    return { revision: result.revision, materialId };
  },

  'camera.set': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const framed = p.bbox ? frameTarget(room.doc, { bbox: p.bbox, padding: p.padding, view: p.view }) : null;
    const op: Op = framed
      ? { op: 'camera.set', camera: { ...p.camera, ...framed.camera } }
      : { op: 'camera.set', camera: p.camera, frame: p.frame, name: p.name, preset: p.preset };
    const result = await room.run(() => room.apply([op]));
    return {
      revision: result.revision,
      camera: room.doc.camera,
      ...(framed
        ? {
            frame: {
              source: framed.source,
              bounds: framed.bounds,
              diag: framed.diag,
              view: framed.view,
              padding: framed.padding,
            },
          }
        : {}),
    };
  },

  'camera.save': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const op: Op = { op: 'camera.save', name: p.name, camera: p.camera };
    const result = await room.run(() => room.apply([op]));
    return { revision: result.revision, camera: room.doc.camera, cameras: room.doc.cameras };
  },

  'camera.delete': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const op: Op = { op: 'camera.delete', name: p.name };
    const result = await room.run(() => room.apply([op]));
    return { revision: result.revision, camera: room.doc.camera, cameras: room.doc.cameras };
  },
};
