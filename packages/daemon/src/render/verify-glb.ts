import { AppError, type SceneDoc, type SceneNode } from '@vibebyte/vibe3d-protocol';

const TOLERANCE = 1e-4;
const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

interface GltfNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  children?: number[];
  extras?: { nodeId?: unknown };
}

interface GltfJson {
  nodes?: GltfNode[];
}

export interface VerifyExportOptions {
  nodeIds?: string[];
}

export interface VerifyExportResult {
  nodes: number;
  skipped: number;
}

function drift(reason: string, data: Record<string, unknown> = {}): never {
  throw new AppError('E_EXPORT_DRIFT', `导出回读与场景不一致：${reason}`, { reason, ...data });
}

function readJson(bytes: Uint8Array): GltfJson {
  if (bytes.byteLength < 20) drift('GLB 长度不足');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) drift('GLB magic 不符');
  if (view.getUint32(4, true) !== 2) drift('GLB 版本不是 2');
  if (view.getUint32(8, true) > bytes.byteLength) drift('GLB 声明长度超出实际数据');
  const length = view.getUint32(12, true);
  const type = view.getUint32(16, true);
  if (type !== JSON_CHUNK) drift('GLB 首个 chunk 不是 JSON');
  if (20 + length > bytes.byteLength) drift('GLB JSON chunk 被截断');
  try {
    return JSON.parse(Buffer.from(bytes.subarray(20, 20 + length)).toString('utf8')) as GltfJson;
  } catch {
    return drift('GLB JSON 无法解析');
  }
}

function eulerToQuat(r: readonly number[]): [number, number, number, number] {
  const [x = 0, y = 0, z = 0] = r;
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

const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE;

function composeMatrix(
  p: readonly number[],
  q: readonly number[],
  s: readonly number[],
): number[] {
  const [x = 0, y = 0, z = 0, w = 1] = q;
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
  const [sx = 1, sy = 1, sz = 1] = s;
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
    p[0] ?? 0,
    p[1] ?? 0,
    p[2] ?? 0,
    1,
  ];
}

function nodeMatrix(node: GltfNode): number[] {
  if (node.matrix?.length === 16) return node.matrix;
  return composeMatrix(
    node.translation ?? [0, 0, 0],
    node.rotation ?? [0, 0, 0, 1],
    node.scale ?? [1, 1, 1],
  );
}

function matrixMatches(actual: number[] | undefined, expected: readonly number[]): boolean {
  if (!actual || actual.length !== 16) return false;
  return actual.every((n, i) => near(n, expected[i] ?? 0));
}

function isExported(node: SceneNode, doc: SceneDoc): boolean {
  for (let current: SceneNode | undefined = node; current; current = current.parent ? doc.nodes[current.parent] : undefined) {
    if (!current.visible) return false;
  }
  return true;
}

function isAnimated(node: SceneNode): boolean {
  return Boolean(node.clip) || (node.kind === 'model' && Boolean(node.anim?.playing));
}

function expectedIds(doc: SceneDoc, nodeIds?: string[]): Set<string> {
  const sceneRoots = new Set(doc.roots);
  const selected = nodeIds?.length ? new Set(nodeIds) : null;
  const ids = new Set<string>();
  for (const node of Object.values(doc.nodes)) {
    if (!isExported(node, doc)) continue;
    const top = topLevel(node, doc);
    if (!top || !sceneRoots.has(top.id)) continue;
    if (selected && !selected.has(top.id)) continue;
    ids.add(node.id);
  }
  return ids;
}

function topLevel(node: SceneNode, doc: SceneDoc): SceneNode | undefined {
  let current = node;
  while (current.parent) {
    const parent = doc.nodes[current.parent];
    if (!parent) return undefined;
    current = parent;
  }
  return current;
}

export function verifyGlbExport(
  doc: SceneDoc,
  bytes: Uint8Array,
  opts: VerifyExportOptions = {},
): VerifyExportResult {
  const nodes = readJson(bytes).nodes ?? [];
  const byId = new Map<string, GltfNode[]>();
  for (const node of nodes) {
    const id = typeof node.extras?.nodeId === 'string' ? node.extras.nodeId : undefined;
    if (!id) continue;
    const list = byId.get(id) ?? [];
    list.push(node);
    byId.set(id, list);
  }

  const expected = expectedIds(doc, opts.nodeIds);
  let skipped = 0;
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const id of expected) {
    const node = doc.nodes[id]!;
    if (isAnimated(node)) {
      skipped++;
      continue;
    }
    const candidates = byId.get(id);
    if (!candidates) {
      missing.push(id);
      continue;
    }
    const expectedMatrix = composeMatrix(
      node.transform.p,
      eulerToQuat(node.transform.r),
      node.transform.s,
    );
    const ok = candidates.some((candidate) => matrixMatches(nodeMatrix(candidate), expectedMatrix));
    if (!ok) mismatched.push(id);
  }

  const extrasIds = new Set(byId.keys());
  for (const id of extrasIds) {
    if (!doc.nodes[id]) drift('GLB 含 doc 之外的 nodeId', { nodeId: id });
  }
  const declared = new Set([...expected].filter((id) => !isAnimated(doc.nodes[id]!)));
  const extra = [...extrasIds].filter((id) => !declared.has(id) && !isAnimated(doc.nodes[id]!));
  if (missing.length || extra.length) {
    drift('节点集合不一致', { missing, extra });
  }
  if (mismatched.length) {
    const nodeId = mismatched[0]!;
    drift('节点 local TRS 不一致', {
      nodeId,
      nodeIds: mismatched,
      expected: doc.nodes[nodeId]!.transform,
      actual: byId.get(nodeId),
    });
  }
  return { nodes: declared.size, skipped };
}
