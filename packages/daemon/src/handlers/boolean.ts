import { AppError, type Op, type SceneDoc, type SceneNode, type Transform } from '@vibebyte/vibe3d-protocol';
import { type Box, bakeBoxes, booleanBoxes, boxFromCenter, boxesTris } from '@vibebyte/vibe3d-scene';
import type { HandlersFor } from './types';

type Keys = 'mesh.boolean';

type Mat3 = [number[], number[], number[]];

function rotMat(r: readonly number[]): Mat3 {
  const [x = 0, y = 0, z = 0] = r;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ];
}

const transpose = (m: Mat3): Mat3 => [
  [m[0][0]!, m[1][0]!, m[2][0]!],
  [m[0][1]!, m[1][1]!, m[2][1]!],
  [m[0][2]!, m[1][2]!, m[2][2]!],
];

const apply = (m: Mat3, v: readonly number[]): [number, number, number] => [
  m[0][0]! * v[0]! + m[0][1]! * v[1]! + m[0][2]! * v[2]!,
  m[1][0]! * v[0]! + m[1][1]! * v[1]! + m[1][2]! * v[2]!,
  m[2][0]! * v[0]! + m[2][1]! * v[1]! + m[2][2]! * v[2]!,
];

const absExtent = (m: Mat3, v: readonly number[]): [number, number, number] => [
  Math.abs(m[0][0]!) * v[0]! + Math.abs(m[0][1]!) * v[1]! + Math.abs(m[0][2]!) * v[2]!,
  Math.abs(m[1][0]!) * v[0]! + Math.abs(m[1][1]!) * v[1]! + Math.abs(m[1][2]!) * v[2]!,
  Math.abs(m[2][0]!) * v[0]! + Math.abs(m[2][1]!) * v[1]! + Math.abs(m[2][2]!) * v[2]!,
];

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

function axisAligned(m: Mat3): boolean {
  return m.every((row) => row.every((v) => near(v, 0) || near(v, 1) || near(v, -1)));
}

function worldOrigin(doc: SceneDoc, node: SceneNode): [number, number, number] {
  let cursor: SceneNode | undefined = node;
  const out: [number, number, number] = [0, 0, 0];
  while (cursor) {
    if (!axisAligned(rotMat(cursor.transform.r))) {
      throw new AppError('E_UNSUPPORTED', `布尔暂只支持 90° 倍数旋转：${cursor.name}`, {
        nodeId: cursor.id,
      });
    }
    out[0] += cursor.transform.p[0];
    out[1] += cursor.transform.p[1];
    out[2] += cursor.transform.p[2];
    cursor = cursor.parent ? doc.nodes[cursor.parent] : undefined;
  }
  return out;
}

function scaleOf(t: Transform): [number, number, number] {
  return [Math.abs(t.s[0]), Math.abs(t.s[1]), Math.abs(t.s[2])];
}

function boxNode(node: SceneNode): { size: [number, number, number]; mat: Mat3 } {
  if (node.kind !== 'mesh' || node.geometry.type !== 'box') {
    throw new AppError('E_UNSUPPORTED', `布尔只接受未烘焙的 box 节点：${node.name}`, {
      nodeId: node.id,
      kind: node.kind,
    });
  }
  return { size: node.geometry.size, mat: rotMat(node.transform.r) };
}

export const booleanHandlers: HandlersFor<Keys> = {
  'mesh.boolean': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (p.target === p.tool) throw new AppError('E_INVALID_PARAMS', 'target 与 tool 不能是同一节点');
    const target = room.doc.nodes[p.target];
    if (!target) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.target} 不存在`);
    const tool = room.doc.nodes[p.tool];
    if (!tool) throw new AppError('E_NODE_NOT_FOUND', `节点 ${p.tool} 不存在`);

    const t = boxNode(target);
    const c = boxNode(tool);
    const tRot = t.mat;
    const tScale = scaleOf(target.transform);
    const toolScale = scaleOf(tool.transform);
    const toolSizeWorld = absExtent(c.mat, [
      c.size[0] * toolScale[0],
      c.size[1] * toolScale[1],
      c.size[2] * toolScale[2],
    ]);
    const toolCenter = worldOrigin(room.doc, tool);
    const targetCenter = worldOrigin(room.doc, target);
    const inv = transpose(tRot);
    const localCenter = apply(inv, [
      toolCenter[0] - targetCenter[0],
      toolCenter[1] - targetCenter[1],
      toolCenter[2] - targetCenter[2],
    ]).map((v, i) => v / tScale[i]!) as [number, number, number];
    const localSize = absExtent(inv, toolSizeWorld).map((v, i) => v / tScale[i]!) as [number, number, number];

    const localTarget = boxFromCenter([0, 0, 0], t.size);
    const localTool: Box = boxFromCenter(localCenter, localSize);
    const boxes = booleanBoxes(p.op, localTarget, localTool);
    const deleteTool = p.deleteTool ?? true;

    const ops: Op[] = [];
    if (boxes.length === 0) {
      ops.push({ op: 'node.delete', id: target.id, cascade: true });
    } else {
      const baked = bakeBoxes(boxes);
      if (baked.positions.length > 300_000 || baked.indices.length > 300_000) {
        throw new AppError('E_PAYLOAD_TOO_LARGE', '布尔结果几何过大', {
          positions: baked.positions.length,
          indices: baked.indices.length,
        });
      }
      ops.push({
        op: 'node.update',
        id: target.id,
        patch: { geometry: { type: 'baked', ...baked } },
      });
    }
    if (deleteTool) ops.push({ op: 'node.delete', id: tool.id, cascade: true });

    const result = await room.run(() => room.apply(ops));
    return {
      revision: result.revision,
      nodeId: target.id,
      tris: boxesTris(boxes),
      boxes: boxes.length,
    };
  },
};
