import type { CameraState, SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';

export type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Bounds = { min: [number, number, number]; max: [number, number, number] };
type Aabb = Bounds;
export type FrameMode = 'fit' | 'close' | 'wide';
export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'three_quarter';

const FRAME_FACTOR: Record<FrameMode, number> = { fit: 1.35, close: 1.0, wide: 2.4 };
const VIEW_DIR: [number, number, number] = [1, 0.55, 1];
const VIEW_DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0.0001],
  three_quarter: VIEW_DIR,
};
export const VIEW_NAMES = Object.keys(VIEW_DIRS) as ViewName[];

function composeLocal(node: SceneNode): Mat4 {
  const [rx, ry, rz] = node.transform.r;
  const [sx, sy, sz] = node.transform.s;
  const [px, py, pz] = node.transform.p;
  const cx = Math.cos(rx);
  const sxx = Math.sin(rx);
  const cy = Math.cos(ry);
  const syy = Math.sin(ry);
  const cz = Math.cos(rz);
  const szz = Math.sin(rz);
  const r00 = cy * cz;
  const r01 = -cy * szz;
  const r02 = syy;
  const r10 = cx * szz + sxx * syy * cz;
  const r11 = cx * cz - sxx * syy * szz;
  const r12 = -sxx * cy;
  const r20 = sxx * szz - cx * syy * cz;
  const r21 = sxx * cz + cx * syy * szz;
  const r22 = cx * cy;
  return [
    sx * r00,
    sx * r10,
    sx * r20,
    0,
    sy * r01,
    sy * r11,
    sy * r21,
    0,
    sz * r02,
    sz * r12,
    sz * r22,
    0,
    px,
    py,
    pz,
    1,
  ];
}

export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out as Mat4;
}

function applyPoint(m: Mat4, p: readonly [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

function localBox(doc: SceneDoc, node: SceneNode): Aabb | null {
  if (node.kind === 'mesh') {
    const g = node.geometry;
    let hx = 0;
    let hy = 0;
    let hz = 0;
    if (g.type === 'box') {
      [hx, hy, hz] = [g.size[0] / 2, g.size[1] / 2, g.size[2] / 2];
    } else if (g.type === 'sphere') {
      hx = hy = hz = g.radius;
    } else if (g.type === 'cylinder') {
      hx = hz = Math.max(g.radiusTop, g.radiusBottom);
      hy = g.height / 2;
    } else if (g.type === 'torus') {
      hx = hz = g.radius + g.tube;
      hy = g.tube;
    } else if (g.type === 'capsule') {
      hx = hz = g.radius;
      hy = g.height / 2 + g.radius;
    } else if (g.type === 'baked') {
      return { min: [...g.bbox.min], max: [...g.bbox.max] };
    } else {
      hx = g.width / 2;
      hy = g.height / 2;
    }
    return { min: [-hx, -hy, -hz], max: [hx, hy, hz] };
  }
  if (node.kind === 'model') {
    const size = doc.assets[node.sha]?.gltf?.size;
    if (!size) return null;
    return { min: [...size.min], max: [...size.max] };
  }
  return null;
}

export function worldMatrix(doc: SceneDoc, id: string): number[] | null {
  const node = doc.nodes[id];
  if (!node) return null;
  const local = composeLocal(node);
  if (!node.parent) return local;
  const parent = worldMatrix(doc, node.parent);
  return parent ? multiplyMat4(parent as Mat4, local) : local;
}

export function worldPointToLocal(
  doc: SceneDoc,
  parentId: string | null,
  point: readonly [number, number, number],
): [number, number, number] {
  const chain: string[] = [];
  let cursor = parentId;
  while (cursor) {
    chain.unshift(cursor);
    cursor = doc.nodes[cursor]?.parent ?? null;
  }
  let out: [number, number, number] = [point[0], point[1], point[2]];
  for (const id of chain) {
    const node = doc.nodes[id];
    if (!node) continue;
    const [sx, sy, sz] = node.transform.s;
    const m = composeLocal(node);
    const d: [number, number, number] = [
      out[0] - node.transform.p[0],
      out[1] - node.transform.p[1],
      out[2] - node.transform.p[2],
    ];
    out = [
      (m[0]! * d[0] + m[1]! * d[1] + m[2]! * d[2]) / (sx * sx),
      (m[4]! * d[0] + m[5]! * d[1] + m[6]! * d[2]) / (sy * sy),
      (m[8]! * d[0] + m[9]! * d[1] + m[10]! * d[2]) / (sz * sz),
    ];
  }
  return out;
}

type Transform = SceneNode['transform'];

function column(m: Mat4, i: 0 | 1 | 2): [number, number, number] {
  return [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rotationOf(m: Mat4): [number, number, number][] {
  const c0 = normalize(column(m, 0));
  const raw1 = column(m, 1);
  const dot = c0[0] * raw1[0] + c0[1] * raw1[1] + c0[2] * raw1[2];
  const c1 = normalize([raw1[0] - c0[0] * dot, raw1[1] - c0[1] * dot, raw1[2] - c0[2] * dot]);
  const c2 = normalize(cross(c0, c1));
  return [c0, c1, c2];
}

function eulerOf(r: [number, number, number][]): [number, number, number] {
  const r00 = r[0]![0];
  const r10 = r[0]![1];
  const r20 = r[0]![2];
  const r01 = r[1]![0];
  const r11 = r[1]![1];
  const r21 = r[1]![2];
  const r02 = r[2]![0];
  const r12 = r[2]![1];
  const r22 = r[2]![2];
  const ry = Math.asin(Math.max(-1, Math.min(1, r02)));
  if (Math.abs(r02) < 0.999999) {
    return [Math.atan2(-r12, r22), ry, Math.atan2(-r01, r00)];
  }
  return [Math.atan2(r21, r11), ry, 0];
}

export function relativeTransform(doc: SceneDoc, id: string, parentId: string | null): Transform {
  const world = worldMatrix(doc, id) as Mat4 | null;
  if (!world) throw new Error(`节点 ${id} 不存在`);
  const parent = parentId ? (worldMatrix(doc, parentId) as Mat4 | null) : null;
  const worldPoint: [number, number, number] = [world[12]!, world[13]!, world[14]!];
  const p = worldPointToLocal(doc, parentId, worldPoint);

  const wr = rotationOf(world);
  const pr = parent ? rotationOf(parent) : null;
  const rel: [number, number, number][] = [0, 1, 2].map((i) => {
    const wc = wr[i]!;
    if (!pr) return wc;
    return [0, 1, 2].map((j) => pr[j]![0] * wc[0] + pr[j]![1] * wc[1] + pr[j]![2] * wc[2]) as [
      number,
      number,
      number,
    ];
  });

  const ws = [0, 1, 2].map((i) => {
    const c = column(world, i as 0 | 1 | 2);
    return Math.hypot(c[0], c[1], c[2]);
  });
  const ps = parent
    ? [0, 1, 2].map((i) => {
        const c = column(parent, i as 0 | 1 | 2);
        return Math.hypot(c[0], c[1], c[2]);
      })
    : [1, 1, 1];
  return {
    p,
    r: eulerOf(rel),
    s: [ws[0]! / ps[0]!, ws[1]! / ps[1]!, ws[2]! / ps[2]!],
  };
}

export function localToAncestor(doc: SceneDoc, id: string, ancestorId: string | null): Mat4 | null {
  const chain: Mat4[] = [];
  let cursor: string | null = id;
  while (cursor && cursor !== ancestorId) {
    const node: SceneNode | undefined = doc.nodes[cursor];
    if (!node) return null;
    chain.unshift(composeLocal(node));
    cursor = node.parent;
  }
  if (ancestorId && cursor !== ancestorId) return null;
  let out: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const m of chain) out = multiplyMat4(out, m);
  return out;
}

function worldMatrices(doc: SceneDoc): Map<string, Mat4> {
  const out = new Map<string, Mat4>();
  const walk = (id: string): Mat4 => {
    const cached = out.get(id);
    if (cached) return cached;
    const node = doc.nodes[id]!;
    const local = composeLocal(node);
    const world = node.parent ? multiplyMat4(walk(node.parent), local) : local;
    out.set(id, world);
    return world;
  };
  for (const id of Object.keys(doc.nodes)) walk(id);
  return out;
}

function expand(box: Aabb | null, m: Mat4, local: Aabb): Aabb {
  let out = box;
  for (let i = 0; i < 8; i++) {
    const corner: [number, number, number] = [
      i & 1 ? local.max[0] : local.min[0],
      i & 2 ? local.max[1] : local.min[1],
      i & 4 ? local.max[2] : local.min[2],
    ];
    const p = applyPoint(m, corner);
    if (!out) out = { min: [...p], max: [...p] };
    else {
      for (let k = 0; k < 3; k++) {
        out.min[k] = Math.min(out.min[k]!, p[k]!);
        out.max[k] = Math.max(out.max[k]!, p[k]!);
      }
    }
  }
  return out as Aabb;
}

function boundsOf(doc: SceneDoc, ids: Iterable<string>): Aabb | null {
  const matrices = worldMatrices(doc);
  let box: Aabb | null = null;
  for (const id of ids) {
    const node = doc.nodes[id];
    if (!node?.visible) continue;
    const local = localBox(doc, node);
    if (!local) continue;
    box = expand(box, matrices.get(id)!, local);
  }
  return box;
}

export function sceneBounds(doc: SceneDoc): Aabb | null {
  return boundsOf(doc, Object.keys(doc.nodes));
}

function subtreeIds(doc: SceneDoc, id: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.parent) continue;
    const list = children.get(node.parent);
    if (list) list.push(node.id);
    else children.set(node.parent, [node.id]);
  }
  const out: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    out.push(current);
    stack.push(...(children.get(current) ?? []));
  }
  return out;
}

export function nodeBounds(doc: SceneDoc, id: string): Aabb | null {
  if (!doc.nodes[id]) return null;
  return boundsOf(doc, subtreeIds(doc, id));
}

export function nodeOwnBounds(doc: SceneDoc, id: string): Aabb | null {
  const node = doc.nodes[id];
  if (!node) return null;
  const local = localBox(doc, node);
  const m = worldMatrix(doc, id);
  if (!local || !m) return null;
  return expand(null, m as Mat4, local);
}

export interface FrameTargetOptions {
  ids?: readonly string[];
  mode?: FrameMode;
  view?: ViewName;
  padding?: number;
  bbox?: Bounds;
}

export interface FrameResult {
  camera: CameraState;
  bounds: Aabb;
  diag: number;
  source: 'bbox' | 'ids' | 'scene';
  view: ViewName;
  padding: number;
}

function validBox(box: Bounds | undefined): box is Bounds {
  if (!box) return false;
  const values = [...box.min, ...box.max];
  if (!values.every((value) => Number.isFinite(value))) return false;
  return Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) > 1e-6;
}

function frameBox(camera: CameraState, box: Aabb, mode: FrameMode, view: ViewName, padding = 1): CameraState {
  const center: [number, number, number] = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const diag = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
  const fov = camera.fov || 45;
  const distance = (Math.max(diag, 0.4) / 2 / Math.tan((fov * Math.PI) / 360)) * FRAME_FACTOR[mode] * padding;
  const dir = VIEW_DIRS[view];
  const norm = Math.hypot(...dir);
  return {
    ...camera,
    target: center,
    p: [
      center[0] + (dir[0] / norm) * distance,
      center[1] + (dir[1] / norm) * distance,
      center[2] + (dir[2] / norm) * distance,
    ],
  };
}

export function frameTarget(doc: SceneDoc, opts: FrameTargetOptions = {}): FrameResult | null {
  const ids = opts.ids && opts.ids.length > 0 ? opts.ids : null;
  const box = validBox(opts.bbox)
    ? opts.bbox
    : ids
      ? boundsOf(
          doc,
          ids.flatMap((id) => subtreeIds(doc, id)),
        )
      : sceneBounds(doc);
  if (!box) return null;
  const source = validBox(opts.bbox) ? 'bbox' : ids ? 'ids' : 'scene';
  const mode = opts.mode ?? (source === 'scene' ? 'fit' : 'close');
  const view = opts.view ?? 'three_quarter';
  const padding = opts.padding ?? 1;
  return {
    camera: frameBox(doc.camera, box, mode, view, padding),
    bounds: box,
    diag: Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]),
    source,
    view,
    padding,
  };
}

export function frameNode(doc: SceneDoc, id: string, mode: FrameMode = 'close'): CameraState | null {
  return frameTarget(doc, { ids: [id], mode })?.camera ?? null;
}

export function frameCamera(doc: SceneDoc, mode: FrameMode = 'fit'): CameraState {
  return frameTarget(doc, { mode, view: 'three_quarter' })?.camera ?? { ...doc.camera };
}

export function miniatureCamera(doc: SceneDoc): CameraState {
  const box = sceneBounds(doc);
  if (!box) return { ...doc.camera };
  const center: [number, number, number] = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const diag = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
  const fov = doc.camera.fov || 45;
  const distance = (Math.max(diag, 0.4) / 2 / Math.tan((fov * Math.PI) / 360)) * 1.15;
  const horizontal = Math.SQRT1_2;
  const dir: [number, number, number] = [horizontal, 1, horizontal];
  const norm = Math.hypot(...dir);
  return {
    ...doc.camera,
    target: center,
    p: [
      center[0] + (dir[0] / norm) * distance,
      center[1] + (dir[1] / norm) * distance,
      center[2] + (dir[2] / norm) * distance,
    ],
  };
}
