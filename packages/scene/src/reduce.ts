import {
  AppError,
  type ClipSpec,
  type MapTransform,
  type Material,
  type ModelAnim,
  type NodePatch,
  type Op,
  type SceneDoc,
  type SceneNode,
} from '@vibebyte/vibe3d-protocol';
import { clipChannelOf, nodeClipsOf } from './anim';
import { frameCamera, miniatureCamera } from './frame';
import { normalizeMap, presetMaterial, resolveMaterialPreset } from './material';
import { sceneStats } from './stats';
import { subtreeIds } from './subtree';
import { DEFAULT_LIMITS, type Limits, validateDoc } from './validate';

export interface OpSummary {
  created: number;
  updated: number;
  deleted: number;
  trisDelta: number;
}

export interface ReduceResult {
  doc: SceneDoc;
  inverse: Op[];
  warnings: string[];
  summary: OpSummary;
}

function fail(message: string, data?: Record<string, unknown>): never {
  throw new AppError('E_INVALID_PARAMS', message, data);
}

function failWith(
  code: 'E_MATERIAL_NOT_FOUND' | 'E_MATERIAL_IN_USE',
  message: string,
  data?: Record<string, unknown>,
): never {
  throw new AppError(code, message, data);
}

const DEFAULT_MATERIAL_ID = 'm_00000000';
const DEFAULT_MATERIAL: Material = {
  baseColor: [0.8, 0.8, 0.82, 1],
  metalness: 0,
  roughness: 0.9,
  emissive: [0, 0, 0],
  emissiveIntensity: 1,
  opacity: 1,
  doubleSided: false,
};

const clone = <T>(v: T): T => structuredClone(v);

const MAX_CLIPS = 8;

type ClipCarrier = { clips?: ClipSpec[]; clip?: ClipSpec };

function setNodeClips(node: ClipCarrier, clips: ClipSpec[]): void {
  if (clips.length === 0) {
    Reflect.deleteProperty(node, 'clips');
    Reflect.deleteProperty(node, 'clip');
    return;
  }
  node.clips = clips;
  node.clip = clips[clips.length - 1];
}

function upsertNodeClip(node: SceneNode, clip: ClipSpec): ClipSpec[] | null {
  const existing = nodeClipsOf(node);
  const channel = clipChannelOf(clip);
  if (existing.some((c) => clipChannelOf(c) === channel)) {
    return existing.map((c) => (clipChannelOf(c) === channel ? clone(clip) : c));
  }
  if (existing.length >= MAX_CLIPS) {
    throw new AppError(
      'E_LIMIT_EXCEEDED',
      `程序化 clip 上限 ${MAX_CLIPS} 条/节点；同通道 define 会替换，不同通道请先 animation.clear 或减少轨道`,
      { limit: MAX_CLIPS, id: node.id },
    );
  }
  return [...existing, clone(clip)];
}

type MaterialPatchInput = Partial<Material> & { color?: Material['baseColor'] };

const normalizeMaterialPatch = (patch: MaterialPatchInput): Partial<Material> => {
  const { color, ...rest } = patch;
  return color !== undefined && rest.baseColor === undefined ? { ...rest, baseColor: color } : rest;
};

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeStageBlock(previous: unknown, patch: unknown): unknown {
  if (!isDict(previous) || !isDict(patch)) return patch;
  const out: Dict = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isDict(value) && isDict(out[key]) ? { ...(out[key] as Dict), ...value } : value;
  }
  return out;
}

function subtree(doc: SceneDoc, rootId: string): string[] {
  return subtreeIds(doc, rootId);
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

function countRefs(doc: SceneDoc, sha: string): number {
  let total = 0;
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === 'model' && node.sha === sha) total += 1;
    if (node.kind === 'mesh' && normalizeMap(doc.materials[node.material]?.map)?.sha === sha) total += 1;
    if (node.kind === 'mesh' && node.decal?.imageSha === sha) total += 1;
  }
  if (doc.env.hdri === sha) total += 1;
  return total;
}

function applyOne(doc: SceneDoc, op: Op, inverse: Op[], warnings: string[]): void {
  switch (op.op) {
    case 'node.create': {
      const node = op.node;
      const id =
        node.id ??
        fail('node.create 缺少 id；走 ops.apply 时由服务端补齐，或直接用 vibe3d_create_node', {
          name: node.name,
        });
      if (doc.nodes[id])
        throw new AppError(
          'E_CONFLICT',
          '节点 id 已存在，不覆盖；重建请用 node.create 的 upsert_by_name 或模板化 scene.import',
          { id, name: node.name },
        );
      if (node.parent && !doc.nodes[node.parent]) fail('父节点不存在', { id: node.parent });
      let next = node as SceneNode;
      if (node.kind === 'mesh' && node.material === undefined) {
        const created = !doc.materials[DEFAULT_MATERIAL_ID];
        if (created) doc.materials[DEFAULT_MATERIAL_ID] = clone(DEFAULT_MATERIAL);
        next = { ...node, material: DEFAULT_MATERIAL_ID } as SceneNode;
        warnings.push(`节点「${node.name}」未给 material，已挂共享默认材质 ${DEFAULT_MATERIAL_ID}`);
        if (created) inverse.push({ op: 'material.delete', id: DEFAULT_MATERIAL_ID, force: true });
      } else if (node.kind === 'mesh' && node.material !== undefined && !doc.materials[node.material]) {
        fail('材质引用不存在；先建材质（vibe3d_create_material）或省略 material 由服务端补默认材质', {
          material: node.material,
        });
      }
      doc.nodes[id] = clone(next);
      if (!node.parent) doc.roots.push(id);
      inverse.push({ op: 'node.delete', id, cascade: true });
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
        node.transform = {
          p: clone(patch.transform.p ?? node.transform.p),
          r: clone(patch.transform.r ?? node.transform.r),
          s: clone(patch.transform.s ?? node.transform.s),
        };
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
      if (patch.geometry !== undefined) {
        if (node.kind !== 'mesh') fail('只有 mesh 节点有 geometry 字段', { id: op.id });
        old.geometry = clone(node.geometry);
        node.geometry = clone(patch.geometry);
      }
      if (patch.material !== undefined) {
        if (node.kind !== 'mesh') fail('只有 mesh 节点有 material 字段', { id: op.id });
        if (!doc.materials[patch.material]) fail('材质不存在', { id: op.id, material: patch.material });
        old.material = node.material;
        node.material = patch.material;
      }
      if (patch.decal !== undefined) {
        if (node.kind !== 'mesh') fail('只有 mesh 节点有 decal 字段', { id: op.id });
        old.decal = node.decal ? clone(node.decal) : null;
        if (patch.decal === null) Reflect.deleteProperty(node, 'decal');
        else node.decal = clone(patch.decal);
      }
      if (patch.sha !== undefined) {
        if (node.kind !== 'model') fail('只有 model 节点有 sha 字段', { id: op.id });
        const asset = doc.assets[patch.sha];
        if (!asset || asset.kind !== 'gltf') fail('模型资产不存在或不是 gltf', { sha: patch.sha });
        old.sha = node.sha;
        if (node.anim) {
          old.anim = clone(node.anim);
          Reflect.deleteProperty(node, 'anim');
        }
        node.sha = patch.sha;
      }
      if (patch.clip !== undefined) {
        old.clip = node.clip ? clone(node.clip) : null;
        if (patch.clip === null) Reflect.deleteProperty(node, 'clip');
        else node.clip = clone(patch.clip);
      }
      if (patch.clips !== undefined) {
        old.clips = node.clips ? clone(node.clips) : null;
        old.clip = node.clip ? clone(node.clip) : null;
        setNodeClips(node, patch.clips === null ? [] : clone(patch.clips));
      }
      if (patch.tags !== undefined) {
        old.tags = node.tags ? [...node.tags] : null;
        if (patch.tags === null || patch.tags.length === 0) Reflect.deleteProperty(node, 'tags');
        else node.tags = [...patch.tags];
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
      const linkedFx = doc.fx.filter((f) => f.nodeId !== undefined && ids.includes(f.nodeId));
      if (linkedFx.length > 0) {
        doc.fx = doc.fx.filter((f) => !linkedFx.includes(f));
        for (const fx of linkedFx) inverse.push({ op: 'fx.create', fx: clone(fx) });
      }
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
      inverse.push({ op: 'material.set', id: op.id, material: clone(previous) });
      const refs = Object.values(doc.nodes)
        .filter((n) => 'material' in n && n.material === op.id)
        .map((n) => n.id)
        .sort();
      if (refs.length > 0 && !op.force) {
        failWith('E_MATERIAL_IN_USE', `材质仍被 ${refs.length} 个节点引用；确认要删请传 force:true`, {
          material: op.id,
          nodes: refs,
        });
      }
      if (refs.length > 0) {
        const created = !doc.materials[DEFAULT_MATERIAL_ID];
        if (created) doc.materials[DEFAULT_MATERIAL_ID] = clone(DEFAULT_MATERIAL);
        for (const id of refs) {
          const node = doc.nodes[id];
          if (node && 'material' in node) node.material = DEFAULT_MATERIAL_ID;
          inverse.push({ op: 'node.update', id: id as `n_${string}`, patch: { material: op.id } });
        }
        if (created) inverse.push({ op: 'material.delete', id: DEFAULT_MATERIAL_ID });
      }
      delete doc.materials[op.id];
      return;
    }
    case 'material.create': {
      if (doc.materials[op.id])
        fail('材质已存在；新建材质请用 vibe3d_create_material（服务端生成 id），或换一个 m_ + 8 位 id', {
          id: op.id,
        });
      const resolved = resolveMaterialPreset(op.preset, op.params);
      doc.materials[op.id] = presetMaterial(resolved.preset, resolved.params);
      if (resolved.note) warnings.push(resolved.note);
      inverse.push({ op: 'material.delete', id: op.id });
      return;
    }
    case 'material.patch': {
      const previous = doc.materials[op.id];
      if (!previous) failWith('E_MATERIAL_NOT_FOUND', '材质不存在', { material: op.id });
      const patch = normalizeMaterialPatch(op.patch);
      doc.materials[op.id] = { ...clone(previous), ...patch };
      inverse.push({ op: 'material.patch', id: op.id, patch: clone(previous) });
      return;
    }
    case 'material.map': {
      const previous = doc.materials[op.id];
      if (!previous) failWith('E_MATERIAL_NOT_FOUND', '材质不存在', { material: op.id });
      const merged = { ...(normalizeMap(previous.map) ?? {}), ...(op.map as object) } as MapTransform;
      if (!merged.sha) fail('map 需要 sha', { id: op.id });
      doc.materials[op.id] = { ...clone(previous), map: merged };
      inverse.push({ op: 'material.patch', id: op.id, patch: { map: previous.map } });
      return;
    }
    case 'env.set': {
      const old: Partial<SceneDoc['env']> = {};
      for (const key of Object.keys(op.env) as (keyof SceneDoc['env'])[]) {
        const value = op.env[key];
        if (value === undefined) continue;
        (old as Record<string, unknown>)[key] = doc.env[key] === undefined ? null : clone(doc.env[key]);
        if (value === null) delete (doc.env as Record<string, unknown>)[key];
        else (doc.env as Record<string, unknown>)[key] = clone(value);
      }
      inverse.push({ op: 'env.set', env: old });
      return;
    }
    case 'asset.register': {
      const previous = doc.assets[op.asset.sha];
      doc.assets[op.asset.sha] = clone(op.asset);
      inverse.push(
        previous
          ? { op: 'asset.register', asset: clone(previous) }
          : { op: 'asset.unregister', sha: op.asset.sha },
      );
      return;
    }
    case 'asset.unregister': {
      const previous = doc.assets[op.sha];
      if (!previous) return;
      if (countRefs(doc, op.sha) > 0) fail('资产仍被引用，不能移除', { sha: op.sha });
      delete doc.assets[op.sha];
      inverse.push({ op: 'asset.register', asset: clone(previous) });
      return;
    }
    case 'stage.set': {
      const old: Partial<SceneDoc['stage']> = {};
      for (const key of Object.keys(op.stage) as (keyof SceneDoc['stage'])[]) {
        const value = op.stage[key];
        if (value === undefined) continue;
        (old as Record<string, unknown>)[key] = clone(doc.stage[key]);
        if (key === 'post' || key === 'npr') {
          if (value === null) {
            Reflect.deleteProperty(doc.stage, key);
          } else {
            (doc.stage as Record<string, unknown>)[key] = mergeStageBlock(doc.stage[key], value);
          }
          continue;
        }
        (doc.stage as Record<string, unknown>)[key] = value;
      }
      inverse.push({ op: 'stage.set', stage: old });
      return;
    }
    case 'animation.play': {
      const node = doc.nodes[op.target] ?? fail('节点不存在', { id: op.target });
      if (node.kind !== 'model') {
        if (nodeClipsOf(node).length > 0) return;
        fail(
          '该节点没有动画：程序化 clip 无需 play，直接 render.snapshot at=<秒> 采样；只有导入模型(GPU动画)需要 play',
          {
            id: op.target,
          },
        );
      }
      const report = doc.assets[node.sha]?.gltf ?? fail('模型资产缺少 gltf 报告', { sha: node.sha });
      const clip = op.clip ?? report.animations[0]?.name;
      if (!clip) fail('资产没有动画', { sha: node.sha });
      if (!report.animations.some((a) => a.name === clip)) fail('clip 不存在', { clip });
      if (report.skins === 0) fail('资产没有蒙皮，不能播放动画', { sha: node.sha });
      const previous: ModelAnim | null = node.anim ? clone(node.anim) : null;
      node.anim = {
        playing: true,
        clip,
        speed: op.speed ?? previous?.speed ?? 1,
        loop: op.loop ?? previous?.loop ?? true,
        direction: op.direction ?? previous?.direction ?? 'forward',
        weight: op.weight ?? previous?.weight ?? 1,
      };
      inverse.push({ op: 'node.update', id: op.target, patch: { anim: previous } });
      return;
    }
    case 'animation.stop': {
      const node = doc.nodes[op.target] ?? fail('节点不存在', { id: op.target });
      if (node.kind !== 'model') {
        if (nodeClipsOf(node).length > 0) return;
        fail('该节点没有动画：程序化 clip 由渲染 at 采样，无需 stop；只有导入模型(GPU动画)需要 stop', {
          id: op.target,
        });
      }
      const previous: ModelAnim | null = node.anim ? clone(node.anim) : null;
      node.anim = { ...(previous ?? { speed: 1 }), playing: false };
      inverse.push({ op: 'node.update', id: op.target, patch: { anim: previous } });
      return;
    }
    case 'animation.define': {
      const ids = op.applyTo === 'subtree' ? subtree(doc, op.target) : [op.target];
      for (const id of ids) {
        const node = doc.nodes[id] ?? fail('节点不存在', { id });
        const next = upsertNodeClip(node, op.clip);
        if (next === null) continue;
        const previousClips = nodeClipsOf(node);
        const previousClip = node.clip ? clone(node.clip) : null;
        setNodeClips(node, next);
        inverse.push({ op: 'node.update', id, patch: { clips: previousClips, clip: previousClip } });
      }
      return;
    }
    case 'animation.clear': {
      const ids = op.applyTo === 'subtree' ? subtree(doc, op.target) : [op.target];
      for (const id of ids) {
        const node = doc.nodes[id] ?? fail('节点不存在', { id });
        const existing = nodeClipsOf(node);
        if (existing.length === 0) continue;
        const kept = op.channel ? existing.filter((c) => clipChannelOf(c) !== op.channel) : [];
        const previousClips = existing;
        const previousClip = node.clip ? clone(node.clip) : null;
        setNodeClips(
          node,
          kept.map((c) => clone(c)),
        );
        inverse.push({ op: 'node.update', id, patch: { clips: previousClips, clip: previousClip } });
      }
      return;
    }
    case 'animation.pose': {
      for (const target of op.targets) {
        const node = doc.nodes[target.nodeId] ?? fail('节点不存在', { id: target.nodeId });
        const next = upsertNodeClip(node, target.clip);
        if (next === null) continue;
        const previousClips = nodeClipsOf(node);
        const previousClip = node.clip ? clone(node.clip) : null;
        setNodeClips(node, next);
        inverse.push({
          op: 'node.update',
          id: target.nodeId,
          patch: { clips: previousClips, clip: previousClip },
        });
      }
      return;
    }
    case 'fx.create': {
      if (doc.fx.some((f) => f.id === op.fx.id))
        fail('特效已存在；新建特效请用 vibe3d_create_fx（服务端生成 id），或换一个 f_ + 8 位 id', {
          fxId: op.fx.id,
        });
      if (op.fx.nodeId && !doc.nodes[op.fx.nodeId]) fail('节点不存在', { id: op.fx.nodeId });
      doc.fx.push(clone(op.fx));
      inverse.push({ op: 'fx.delete', id: op.fx.id });
      return;
    }
    case 'fx.delete': {
      const index = doc.fx.findIndex((f) => f.id === op.id);
      if (index < 0) return;
      const previous = clone(doc.fx[index]!);
      doc.fx.splice(index, 1);
      inverse.push({ op: 'fx.create', fx: previous });
      return;
    }
    case 'camera.set': {
      if (!op.frame && !op.camera && !op.name && !op.preset) {
        fail('camera / frame / name / preset 必须给出一个');
      }
      const previous = clone(doc.camera);
      let next = doc.camera;
      if (op.frame) next = frameCamera(doc, op.frame);
      if (op.preset) next = miniatureCamera(doc);
      if (op.name) {
        const saved = doc.cameras[op.name];
        if (!saved) throw new AppError('E_CAMERA_NOT_FOUND', `机位 ${op.name} 不存在`, { name: op.name });
        next = clone(saved);
      }
      if (op.camera) next = { ...next, ...op.camera };
      doc.camera = next;
      inverse.push({ op: 'camera.set', camera: previous });
      return;
    }
    case 'camera.save': {
      const previous = doc.cameras[op.name];
      const pose = { ...doc.camera, ...op.camera };
      doc.cameras[op.name] = clone(pose);
      inverse.push(
        previous
          ? { op: 'camera.save', name: op.name, camera: clone(previous) }
          : { op: 'camera.delete', name: op.name },
      );
      return;
    }
    case 'camera.delete': {
      const previous = doc.cameras[op.name];
      if (!previous) throw new AppError('E_CAMERA_NOT_FOUND', `机位 ${op.name} 不存在`, { name: op.name });
      Reflect.deleteProperty(doc.cameras, op.name);
      inverse.push({ op: 'camera.save', name: op.name, camera: clone(previous) });
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
  const trisBefore = sceneStats(current).tris;
  for (const op of ops) {
    if (op.op === 'scene.replace') {
      inverse.push({ op: 'scene.replace', doc: clone(current) });
      current = clone(op.doc);
      continue;
    }
    applyOne(current, op, inverse, warnings);
  }
  validateDoc(current, limits);
  const added = new Set<string>();
  const updated = new Set<string>();
  const removed = new Set<string>();
  for (const op of ops) {
    if (op.op === 'node.create') {
      if (op.node.id) added.add(op.node.id);
    } else if (op.op === 'node.delete') removed.add(op.id);
    else if ('id' in op && typeof op.id === 'string' && op.id.startsWith('n_')) updated.add(op.id);
  }
  const summary: OpSummary = {
    created: added.size,
    updated: [...updated].filter((id) => !added.has(id) && !removed.has(id)).length,
    deleted: [...removed].filter((id) => !added.has(id)).length,
    trisDelta: sceneStats(current).tris - trisBefore,
  };
  return { doc: current, inverse, warnings, summary };
}

export const inverseOps = (result: ReduceResult): Op[] => result.inverse;

export type { SceneNode };
