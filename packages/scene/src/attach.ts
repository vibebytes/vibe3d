import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { type Bounds, nodeBounds, nodeOwnBounds } from './frame';

export type Vec3 = [number, number, number];
export type AttachFace = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
export type AttachCorner = 'min-min' | 'min-max' | 'max-min' | 'max-max';

export interface AttachOptions {
  face: AttachFace;
  corner?: AttachCorner;
  offset?: number;
}

type Axis = 0 | 1 | 2;
type Side = -1 | 1;
type Anchor = 'min' | 'max';

type FaceSpec = { axis: Axis; side: Side; u: Axis; v: Axis };

const FACES: Record<AttachFace, FaceSpec> = {
  top: { axis: 1, side: 1, u: 0, v: 2 },
  bottom: { axis: 1, side: -1, u: 0, v: 2 },
  right: { axis: 0, side: 1, u: 2, v: 1 },
  left: { axis: 0, side: -1, u: 2, v: 1 },
  front: { axis: 2, side: 1, u: 0, v: 1 },
  back: { axis: 2, side: -1, u: 0, v: 1 },
};

const CORNERS: Record<AttachCorner, [Anchor, Anchor]> = {
  'min-min': ['min', 'min'],
  'min-max': ['min', 'max'],
  'max-min': ['max', 'min'],
  'max-max': ['max', 'max'],
};

function bad(message: string, data?: Record<string, unknown>): never {
  throw new AppError('E_INVALID_PARAMS', message, data);
}

function boxOf(doc: SceneDoc, id: string): Bounds | null {
  return nodeOwnBounds(doc, id) ?? nodeBounds(doc, id);
}

function edge(box: Bounds, axis: Axis, anchor: Anchor): number {
  return anchor === 'min' ? box.min[axis] : box.max[axis];
}

export function attachDelta(doc: SceneDoc, id: string, targetId: string, opts: AttachOptions): Vec3 | null {
  const node = doc.nodes[id];
  const target = doc.nodes[targetId];
  if (!node?.visible || !target?.visible) return null;
  const own = boxOf(doc, id);
  const host = boxOf(doc, targetId);
  if (!own || !host) return null;

  const spec = FACES[opts.face];
  if (!spec) bad(`未知的吸附面：${String(opts.face)}`, { face: opts.face });
  const anchors = opts.corner === undefined ? null : CORNERS[opts.corner];
  if (opts.corner !== undefined && !anchors) bad(`未知的吸附角：${String(opts.corner)}`, { corner: opts.corner });
  const gap = opts.offset ?? 0;
  if (!Number.isFinite(gap)) bad(`offset 必须为有限数：${String(opts.offset)}`, { offset: opts.offset });

  const delta: Vec3 = [0, 0, 0];
  delta[spec.axis] =
    spec.side > 0
      ? host.max[spec.axis] + gap - own.min[spec.axis]
      : host.min[spec.axis] - gap - own.max[spec.axis];

  const tangents: Array<[Axis, Anchor | null]> = [
    [spec.u, anchors?.[0] ?? null],
    [spec.v, anchors?.[1] ?? null],
  ];
  for (const [axis, anchor] of tangents) {
    delta[axis] = anchor
      ? edge(host, axis, anchor) - edge(own, axis, anchor)
      : (host.min[axis] + host.max[axis]) / 2 - (own.min[axis] + own.max[axis]) / 2;
  }
  return delta;
}
