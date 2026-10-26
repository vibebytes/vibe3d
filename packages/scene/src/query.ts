import type {
  AssetMeta,
  ClipSpec,
  LightSpec,
  Material,
  ModelAnim,
  SceneDoc,
  SceneNode,
} from '@vibebyte/vibe3d-protocol';
import { nodeClipsOf } from './anim';
import { nodeBounds } from './frame';

type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export type NodeKind = SceneNode['kind'];

export interface NodeFilter {
  name?: string;
  kind?: NodeKind;
  materialId?: string;
  tags?: string[];
  bbox?: { min: Vec3; max: Vec3 };
  withinBBox?: { min: Vec3; max: Vec3 };
  parentId?: string | null;
  hasChildren?: boolean;
  minY?: number;
  maxY?: number;
  hasAnim?: boolean;
  visible?: boolean;
  limit?: number;
  cursor?: number;
}

export interface NodeBrief {
  id: string;
  name: string;
  kind: NodeKind;
  visible: boolean;
  parentId: string | null;
  childCount: number;
  worldBbox: Bounds | null;
  materialId?: string;
  hasAnim: boolean;
  tags?: string[];
}

export interface NodeView extends NodeBrief {
  children: string[];
  material?: Material;
  light?: LightSpec;
  anim?: ModelAnim;
  asset?: AssetMeta;
  clips?: ClipSpec[];
}

export interface QueryResult {
  nodes: NodeBrief[];
  total: number;
  next?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function childIndex(doc: SceneDoc): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.parent) continue;
    const list = index.get(node.parent);
    if (list) list.push(node.id);
    else index.set(node.parent, [node.id]);
  }
  return index;
}

function materialIdOf(node: SceneNode): string | undefined {
  return node.kind === 'mesh' ? node.material : undefined;
}

function hasAnim(node: SceneNode): boolean {
  return (node.kind === 'model' && Boolean(node.anim)) || nodeClipsOf(node).length > 0;
}

function intersects(box: Bounds, filter: { min: Vec3; max: Vec3 }): boolean {
  for (let i = 0; i < 3; i++) {
    if (box.min[i]! > filter.max[i]!) return false;
    if (box.max[i]! < filter.min[i]!) return false;
  }
  return true;
}

function contains(box: Bounds, filter: { min: Vec3; max: Vec3 }): boolean {
  for (let i = 0; i < 3; i++) {
    if (box.min[i]! < filter.min[i]!) return false;
    if (box.max[i]! > filter.max[i]!) return false;
  }
  return true;
}

function matches(node: SceneNode, filter: NodeFilter, box: Bounds | null, childCount: number): boolean {
  if (filter.name && !node.name.toLowerCase().includes(filter.name.toLowerCase())) return false;
  if (filter.kind && node.kind !== filter.kind) return false;
  if (filter.materialId && materialIdOf(node) !== filter.materialId) return false;
  if (filter.tags && filter.tags.length > 0 && !filter.tags.every((tag) => node.tags?.includes(tag)))
    return false;
  if (filter.visible !== undefined && node.visible !== filter.visible) return false;
  if (filter.hasAnim !== undefined && hasAnim(node) !== filter.hasAnim) return false;
  if (filter.parentId !== undefined && (node.parent ?? null) !== filter.parentId) return false;
  if (filter.hasChildren !== undefined && childCount > 0 !== filter.hasChildren) return false;
  if (filter.bbox || filter.withinBBox || filter.minY !== undefined || filter.maxY !== undefined) {
    if (!box) return false;
    if (filter.bbox && !intersects(box, filter.bbox)) return false;
    if (filter.withinBBox && !contains(box, filter.withinBBox)) return false;
    if (filter.minY !== undefined && box.min[1] < filter.minY) return false;
    if (filter.maxY !== undefined && box.max[1] > filter.maxY) return false;
  }
  return true;
}

export function queryNodes(doc: SceneDoc, filter: NodeFilter = {}): QueryResult {
  const children = childIndex(doc);
  const limit = Math.min(MAX_LIMIT, Math.max(1, filter.limit ?? DEFAULT_LIMIT));
  const cursor = Math.max(0, filter.cursor ?? 0);
  const hits: NodeBrief[] = [];
  const ordered = Object.values(doc.nodes).sort((a, b) =>
    a.name === b.name ? (a.id < b.id ? -1 : 1) : a.name < b.name ? -1 : 1,
  );

  for (const node of ordered) {
    const id = node.id;
    const box = nodeBounds(doc, id);
    if (!matches(node, filter, box, children.get(id)?.length ?? 0)) continue;
    hits.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      visible: node.visible,
      parentId: node.parent,
      childCount: children.get(node.id)?.length ?? 0,
      worldBbox: box ? { min: [...box.min], max: [...box.max] } : null,
      ...(materialIdOf(node) === undefined ? {} : { materialId: materialIdOf(node) }),
      hasAnim: hasAnim(node),
      ...(node.tags === undefined ? {} : { tags: [...node.tags] }),
    });
  }

  const page = hits.slice(cursor, cursor + limit);
  const next = cursor + limit < hits.length ? cursor + limit : undefined;
  return { nodes: page, total: hits.length, ...(next === undefined ? {} : { next }) };
}

export function nodeView(doc: SceneDoc, id: string): NodeView | null {
  const node = doc.nodes[id];
  if (!node) return null;
  const box = nodeBounds(doc, id);
  const children = Object.values(doc.nodes)
    .filter((child) => child.parent === node.id)
    .map((child) => child.id)
    .sort();
  const view: NodeView = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    visible: node.visible,
    parentId: node.parent,
    childCount: children.length,
    worldBbox: box ? { min: [...box.min], max: [...box.max] } : null,
    children,
    hasAnim: hasAnim(node),
  };
  if (node.tags !== undefined) view.tags = [...node.tags];
  const clips = nodeClipsOf(node);
  if (clips.length > 0) view.clips = clips;
  if (node.kind === 'mesh') {
    view.materialId = node.material;
    view.material = doc.materials[node.material];
  } else if (node.kind === 'light') {
    view.light = node.light;
  } else if (node.kind === 'model') {
    if (node.anim) view.anim = node.anim;
    view.asset = doc.assets[node.sha];
  }
  return view;
}
