import { AppError, type SceneDoc, type SceneNode } from '@vibebyte/vibe3d-protocol';
import { type Vec3, bakeGeometry } from './bake';
import { type Mat4, localToAncestor } from './frame';

export interface MergeOptions {
  nodeId: string;
  material?: string;
}

export interface MergePlan {
  sources: string[];
  positions: number[];
  normals: number[];
  indices: number[];
  bbox: { min: Vec3; max: Vec3 };
  tris: number;
  vertices: number;
  material: string;
}

type BlockerReason = 'light' | 'model' | 'animation' | 'decal';

function blockerOf(node: SceneNode): BlockerReason | null {
  if (node.kind === 'light') return 'light';
  if (node.kind === 'model') return 'model';
  if (node.clip) return 'animation';
  if ('decal' in node && node.decal) return 'decal';
  return null;
}

function childrenIndex(doc: SceneDoc): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.parent) continue;
    const list = out.get(node.parent);
    if (list) list.push(node.id);
    else out.set(node.parent, [node.id]);
  }
  return out;
}

function descendantsOf(doc: SceneDoc, rootId: string): string[] {
  const kids = childrenIndex(doc);
  const ids: string[] = [];
  const stack = [...(kids.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return ids.sort();
}

function cofactor(m: Mat4): Mat4 {
  const c0: Vec3 = [m[0]!, m[1]!, m[2]!];
  const c1: Vec3 = [m[4]!, m[5]!, m[6]!];
  const c2: Vec3 = [m[8]!, m[9]!, m[10]!];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const n0 = cross(c1, c2);
  const n1 = cross(c2, c0);
  const n2 = cross(c0, c1);
  return [n0[0], n0[1], n0[2], 0, n1[0], n1[1], n1[2], 0, n2[0], n2[1], n2[2], 0, 0, 0, 0, 1];
}

function pushPoint(out: number[], m: Mat4, src: readonly number[], i: number): void {
  const x = src[i]!;
  const y = src[i + 1]!;
  const z = src[i + 2]!;
  out.push(
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  );
}

function pushNormal(out: number[], nm: Mat4, src: readonly number[], i: number): void {
  const x = src[i]!;
  const y = src[i + 1]!;
  const z = src[i + 2]!;
  let nx = nm[0]! * x + nm[4]! * y + nm[8]! * z;
  let ny = nm[1]! * x + nm[5]! * y + nm[9]! * z;
  let nz = nm[2]! * x + nm[6]! * y + nm[10]! * z;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) {
    nx = 0;
    ny = 1;
    nz = 0;
  } else {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  out.push(nx, ny, nz);
}

export function mergeGroup(doc: SceneDoc, opts: MergeOptions): MergePlan {
  const root = doc.nodes[opts.nodeId];
  if (!root) {
    throw new AppError('E_NODE_NOT_FOUND', `节点 ${opts.nodeId} 不存在`, { nodeId: opts.nodeId });
  }
  if (root.kind !== 'group') {
    throw new AppError('E_INVALID_PARAMS', `节点 ${opts.nodeId} 不是组`, { nodeId: opts.nodeId });
  }

  const ids = descendantsOf(doc, root.id);
  const sources: string[] = [];
  const blockers: { nodeId: string; reason: string }[] = [];
  const materials = new Set<string>();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let tris = 0;

  for (const id of ids) {
    const node = doc.nodes[id]!;
    const blocked = blockerOf(node);
    if (blocked) {
      blockers.push({ nodeId: id, reason: blocked });
      continue;
    }
    if (node.kind === 'group') continue;
    if (node.kind !== 'mesh') continue;

    const m = localToAncestor(doc, id, root.id);
    if (!m) continue;
    const baked = bakeGeometry(node.geometry);
    const nm = cofactor(m);
    const offset = positions.length / 3;
    for (let i = 0; i < baked.positions.length; i += 3) pushPoint(positions, m, baked.positions, i);
    for (let i = 0; i < baked.normals.length; i += 3) pushNormal(normals, nm, baked.normals, i);
    for (const index of baked.indices) indices.push(index + offset);
    tris += baked.indices.length / 3;
    sources.push(id);
    materials.add(node.material);
  }

  if (blockers.length > 0) {
    throw new AppError('E_UNSUPPORTED', `组内 ${blockers.length} 个节点无法烘焙`, {
      nodeId: root.id,
      blockers,
    });
  }

  if (opts.material && !doc.materials[opts.material]) {
    throw new AppError('E_INVALID_PARAMS', `材质 ${opts.material} 不存在`, {
      material: opts.material,
    });
  }

  const distinct = [...materials].sort();
  const looks = new Set(distinct.map((id) => JSON.stringify(doc.materials[id] ?? null)));
  if (looks.size > 1 && !opts.material) {
    throw new AppError('E_UNSUPPORTED', `组内材质不一致（${distinct.join(', ')}），请显式指定 material`, {
      nodeId: root.id,
      materials: distinct,
    });
  }

  const vertices = positions.length / 3;
  if (vertices === 0) {
    throw new AppError('E_INVALID_PARAMS', `组 ${root.id} 内没有可烘焙的网格`, { nodeId: root.id });
  }

  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }

  return {
    sources,
    positions,
    normals,
    indices,
    bbox: { min, max },
    tris,
    vertices,
    material: opts.material ?? distinct[0]!,
  };
}
