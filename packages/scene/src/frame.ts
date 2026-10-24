import type { CameraState, SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';

type Mat4 = [
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

function multiply(a: Mat4, b: Mat4): Mat4 {
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

function worldMatrices(doc: SceneDoc): Map<string, Mat4> {
  const out = new Map<string, Mat4>();
  const walk = (id: string): Mat4 => {
    const cached = out.get(id);
    if (cached) return cached;
    const node = doc.nodes[id]!;
    const local = composeLocal(node);
    const world = node.parent ? multiply(walk(node.parent), local) : local;
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

export interface FrameTargetOptions {
  ids?: readonly string[];
  mode?: FrameMode;
  view?: ViewName;
  padding?: number;
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

export function frameTarget(
  doc: SceneDoc,
  opts: FrameTargetOptions = {},
): { camera: CameraState; bounds: Aabb } | null {
  const ids = opts.ids && opts.ids.length > 0 ? opts.ids : null;
  const box = ids
    ? boundsOf(
        doc,
        ids.flatMap((id) => subtreeIds(doc, id)),
      )
    : sceneBounds(doc);
  if (!box) return null;
  const mode = opts.mode ?? (ids ? 'close' : 'fit');
  return {
    camera: frameBox(doc.camera, box, mode, opts.view ?? 'three_quarter', opts.padding ?? 1),
    bounds: box,
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
