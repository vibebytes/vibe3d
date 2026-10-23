import {
  AppError,
  type ModelAnim,
  type NodePatch,
  type Op,
  type SceneDoc,
  type SceneNode,
} from '@vibebyte/vibe3d-protocol';
import { frameCamera } from './frame';
import { DEFAULT_LIMITS, type Limits, validateDoc } from './validate';

export interface ReduceResult {
  doc: SceneDoc;
  inverse: Op[];
  warnings: string[];
}

function fail(message: string, data?: Record<string, unknown>): never {
  throw new AppError('E_INVALID_PARAMS', message, data);
}

const clone = <T>(v: T): T => structuredClone(v);

function childrenMap(doc: SceneDoc): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!node.parent) continue;
    const list = map.get(node.parent);
    if (list) list.push(id);
    else map.set(node.parent, [id]);
  }
  return map;
}

function subtree(doc: SceneDoc, rootId: string): string[] {
  const kids = childrenMap(doc);
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const child of kids.get(id) ?? []) queue.push(child);
  }
  return out;
}

const isAncestor = (doc: SceneDoc, ancestor: string, id: string): boolean => {
  let cursor: string | null = doc.nodes[id]?.parent ?? null;
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === ancestor) return true;
    if (guard.has(cursor)) return false;
    guard.add(cursor);
    cursor = doc.nodes[cursor]?.parent ?? null;
  }
  return false;
};

function applyOne(doc: SceneDoc, op: Op, inverse: Op[], warnings: string[]): void {
  switch (op.op) {
    case 'node.create': {
      const node = op.node;
      if (doc.nodes[node.id]) fail('节点已存在', { id: node.id });
      if (node.parent && !doc.nodes[node.parent]) fail('父节点不存在', { id: node.parent });
      doc.nodes[node.id] = clone(node);
      if (!node.parent) doc.roots.push(node.id);
      inverse.push({ op: 'node.delete', id: node.id, cascade: true });
      return;
    }
    case 'node.update': {
      const node = doc.nodes[op.id] ?? fail('节点不存在', { id: op.id });
      const patch: NodePatch = op.patch;
      const old: NodePatch = {};
      if (patch.name !== undefined) {
        old.name = node.name;
        node.name = patch.name;
      }
      if (patch.visible !== undefined) {
        old.visible = node.visible;
        node.visible = patch.visible;
      }
      if (patch.transform !== undefined) {
        old.transform = clone(node.transform);
        node.transform = clone(patch.transform);
      }
      if (patch.light !== undefined) {
        if (node.kind !== 'light') fail('只有 light 节点有 light 字段', { id: op.id });
        old.light = clone(node.light);
        node.light = clone(patch.light);
      }
      if (patch.anim !== undefined) {
        if (node.kind !== 'model') fail('只有 model 节点有 anim 字段', { id: op.id });
        old.anim = node.anim ? clone(node.anim) : null;
        if (patch.anim === null) Reflect.deleteProperty(node, 'anim');
        else node.anim = clone(patch.anim);
      }
      inverse.push({ op: 'node.update', id: op.id, patch: old });
      return;
    }
    case 'node.delete': {
      const node = doc.nodes[op.id] ?? fail('节点不存在', { id: op.id });
      const ids = subtree(doc, op.id);
      const cascade = op.cascade ?? true;
      if (!cascade && ids.length > 1)
        fail('存在子节点，需显式 cascade', { id: op.id, children: ids.length - 1 });
      const index = doc.roots.indexOf(op.id);
      const snapshot = ids.map((id) => clone(doc.nodes[id]!));
      for (const id of ids) delete doc.nodes[id];
      doc.roots = doc.roots.filter((id) => id !== op.id);
      for (const n of snapshot) inverse.push({ op: 'node.create', node: n });
      if (node.parent === null) {
        inverse.push({ op: 'node.reparent', id: op.id, parent: null, index: Math.max(0, index) });
      }
      if (ids.length > 1) warnings.push(`级联删除 ${ids.length} 个节点`);
      return;
    }
    case 'node.reparent': {
      const node = doc.nodes[op.id] ?? fail('节点不存在', { id: op.id });
      if (op.parent) {
        if (!doc.nodes[op.parent]) fail('目标父节点不存在', { id: op.parent });
        if (op.parent === op.id || isAncestor(doc, op.id, op.parent)) {
          fail('不能把节点移入自己的子树', { id: op.id, parent: op.parent });
        }
      }
      const oldParent = node.parent;
      const oldIndex = oldParent === null ? doc.roots.indexOf(op.id) : -1;
      doc.roots = doc.roots.filter((id) => id !== op.id);
      node.parent = op.parent;
      if (op.parent === null) {
        const at = Math.min(op.index ?? doc.roots.length, doc.roots.length);
        doc.roots.splice(at, 0, op.id);
      }
      inverse.push({
        op: 'node.reparent',
        id: op.id,
        parent: oldParent,
        ...(oldParent === null ? { index: Math.max(0, oldIndex) } : {}),
      });
      return;
    }
    case 'material.set': {
      const previous = doc.materials[op.id];
      doc.materials[op.id] = clone(op.material);
      inverse.push(
        previous
          ? { op: 'material.set', id: op.id, material: clone(previous) }
          : { op: 'material.delete', id: op.id },
      );
      return;
    }
    case 'material.delete': {
      const previous = doc.materials[op.id];
      if (!previous) return;
      delete doc.materials[op.id];
      inverse.push({ op: 'material.set', id: op.id, material: clone(previous) });
      return;
    }
    case 'env.set': {
      const old: Partial<SceneDoc['env']> = {};
      for (const key of Object.keys(op.env) as (keyof SceneDoc['env'])[]) {
        if (op.env[key] === undefined) continue;
        (old as Record<string, unknown>)[key] = clone(doc.env[key]);
        (doc.env as Record<string, unknown>)[key] = clone(op.env[key]);
      }
      inverse.push({ op: 'env.set', env: old });
      return;
    }
    case 'stage.set': {
      const old: Partial<SceneDoc['stage']> = {};
      for (const key of Object.keys(op.stage) as (keyof SceneDoc['stage'])[]) {
        if (op.stage[key] === undefined) continue;
        (old as Record<string, unknown>)[key] = doc.stage[key];
        (doc.stage as Record<string, unknown>)[key] = op.stage[key];
      }
      inverse.push({ op: 'stage.set', stage: old });
      return;
    }
    case 'animation.play': {
      const node = doc.nodes[op.target] ?? fail('节点不存在', { id: op.target });
      if (node.kind !== 'model') fail('只有 model 节点可以播放动画', { id: op.target });
      const report = doc.assets[node.sha]?.gltf ?? fail('模型资产缺少 gltf 报告', { sha: node.sha });
      const clip = op.clip ?? report.animations[0]?.name;
      if (!clip) fail('资产没有动画', { sha: node.sha });
      if (!report.animations.some((a) => a.name === clip)) fail('clip 不存在', { clip });
      if (report.skins === 0) fail('资产没有蒙皮，不能播放动画', { sha: node.sha });
      const previous: ModelAnim | null = node.anim ? clone(node.anim) : null;
      node.anim = { playing: true, clip, speed: op.speed ?? previous?.speed ?? 1 };
      inverse.push({ op: 'node.update', id: op.target, patch: { anim: previous } });
      return;
    }
    case 'animation.stop': {
      const node = doc.nodes[op.target] ?? fail('节点不存在', { id: op.target });
      if (node.kind !== 'model') fail('只有 model 节点有动画', { id: op.target });
      const previous: ModelAnim | null = node.anim ? clone(node.anim) : null;
      node.anim = { ...(previous ?? { speed: 1 }), playing: false };
      inverse.push({ op: 'node.update', id: op.target, patch: { anim: previous } });
      return;
    }
    case 'camera.set': {
      if (!op.frame && !op.camera) fail('camera 与 frame 必须给出一个');
      const previous = clone(doc.camera);
      if (op.frame) doc.camera = frameCamera(doc, op.frame);
      if (op.camera) doc.camera = { ...doc.camera, ...op.camera };
      inverse.push({ op: 'camera.set', camera: previous });
      return;
    }
    default:
      fail('未知 op');
  }
}

export function applyOps(doc: SceneDoc, ops: readonly Op[], limits: Limits = DEFAULT_LIMITS): ReduceResult {
  let current = clone(doc);
  const inverse: Op[] = [];
  const warnings: string[] = [];
  for (const op of ops) {
    if (op.op === 'scene.replace') {
      inverse.push({ op: 'scene.replace', doc: clone(current) });
      current = clone(op.doc);
      continue;
    }
    applyOne(current, op, inverse, warnings);
  }
  validateDoc(current, limits);
  return { doc: current, inverse, warnings };
}

export const inverseOps = (result: ReduceResult): Op[] => result.inverse;

export type { SceneNode };
