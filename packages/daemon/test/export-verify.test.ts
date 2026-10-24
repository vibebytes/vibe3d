import { type SceneDoc, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { verifyGlbExport } from '../src/render/verify-glb';

interface GlbNode {
  name?: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
  children?: number[];
  extras?: { nodeId?: string };
}

function composeMatrix(
  p: readonly [number, number, number],
  r: readonly [number, number, number],
  s: readonly [number, number, number],
): number[] {
  const [x, y, z, w] = eulerToQuat(r);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    p[0],
    p[1],
    p[2],
    1,
  ];
}

function eulerToQuat(r: readonly [number, number, number]): [number, number, number, number] {
  const [x, y, z] = r;
  const c1 = Math.cos(x / 2);
  const s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2);
  const s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function glb(nodes: GlbNode[]): Uint8Array {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: nodes.length ? [0] : [] }],
      nodes,
    }),
    'utf8',
  );
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const out = Buffer.alloc(12 + 8 + padded.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(out, 20);
  return new Uint8Array(out);
}

function glbNode(node: SceneNode, children?: number[]): GlbNode {
  return {
    name: node.name,
    translation: [...node.transform.p],
    rotation: eulerToQuat(node.transform.r),
    scale: [...node.transform.s],
    ...(children ? { children } : {}),
    extras: { nodeId: node.id },
  };
}

function docWith(nodes: SceneNode[]): SceneDoc {
  const doc = emptyDoc('verify');
  for (const node of nodes) doc.nodes[node.id] = node;
  doc.roots = nodes.filter((n) => n.parent === null).map((n) => n.id);
  return doc;
}

const group: SceneNode = {
  id: 'n_00000001',
  kind: 'group',
  name: '街角',
  parent: null,
  visible: true,
  transform: { p: [1, 2, 3], r: [0.2, -0.4, 0.6], s: [2, 1, 0.5] },
};

const box: SceneNode = {
  id: 'n_00000002',
  kind: 'mesh',
  name: '台阶',
  parent: group.id,
  visible: true,
  transform: { p: [-0.5, 0.25, 1.5], r: [0, 0.3, 0], s: [1, 1, 1] },
  geometry: { type: 'box', size: [1, 1, 1] },
  material: 'm_00000001',
};

describe('verifyGlbExport', () => {
  it('accepts a GLB whose node tree and local TRS match the doc', () => {
    const doc = docWith([group, box]);
    const bytes = glb([glbNode(group, [1]), glbNode(box)]);
    expect(verifyGlbExport(doc, bytes)).toEqual({ nodes: 2, skipped: 0 });
  });

  it('accepts matrix-encoded nodes emitted by GLTFExporter', () => {
    const doc = docWith([group, box]);
    const outer: GlbNode = { name: group.name, extras: { nodeId: group.id }, children: [1] };
    outer.matrix = composeMatrix(group.transform.p, group.transform.r, group.transform.s);
    const inner: GlbNode = { name: group.name, extras: { nodeId: group.id } };
    const bytes = glb([outer, inner, glbNode(box)]);
    expect(verifyGlbExport(doc, bytes)).toEqual({ nodes: 2, skipped: 0 });
  });

  it('reports E_EXPORT_DRIFT when a matrix-encoded transform deviates', () => {
    const doc = docWith([group, box]);
    const outer: GlbNode = { name: group.name, extras: { nodeId: group.id } };
    outer.matrix = composeMatrix([9, 2, 3], group.transform.r, group.transform.s);
    const bytes = glb([outer, glbNode(box)]);
    expect(() => verifyGlbExport(doc, bytes)).toThrowError(
      expect.objectContaining({ code: 'E_EXPORT_DRIFT' }),
    );
  });

  it('reports E_EXPORT_DRIFT when a serialized transform deviates', () => {
    const doc = docWith([group, box]);
    const drifted = glbNode(box);
    drifted.translation = [0.5, 0.25, 1.5];
    const bytes = glb([glbNode(group, [1]), drifted]);
    expect(() => verifyGlbExport(doc, bytes)).toThrowError(
      expect.objectContaining({ code: 'E_EXPORT_DRIFT' }),
    );
  });

  it('reports E_EXPORT_DRIFT when the exported node count differs', () => {
    const doc = docWith([group, box]);
    const bytes = glb([glbNode(group)]);
    expect(() => verifyGlbExport(doc, bytes)).toThrowError(
      expect.objectContaining({ code: 'E_EXPORT_DRIFT' }),
    );
  });
});
