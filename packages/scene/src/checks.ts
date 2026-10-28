import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { type Bounds, nodeBounds, nodeOwnBounds } from './frame';
import { type SceneStats, sceneStats } from './stats';

export type CheckCode =
  | 'floating'
  | 'intersect'
  | 'belowGround'
  | 'outsideBounds'
  | 'orphan-child'
  | 'suspect-scale'
  | 'mixed-semantics'
  | 'bimodal-local';

export interface SceneIssue {
  code: CheckCode;
  nodeIds: string[];
  severity: 'warn' | 'error';
  detail: string;
  fixHint: string;
  bounds?: Bounds;
}

export function unionBounds(boxes: (Bounds | null | undefined)[]): Bounds | undefined {
  const list = boxes.filter((b): b is Bounds => b != null);
  if (!list.length) return undefined;
  const min = [0, 1, 2].map((axis) => Math.min(...list.map((b) => b.min[axis]!)));
  const max = [0, 1, 2].map((axis) => Math.max(...list.map((b) => b.max[axis]!)));
  return { min: min as Bounds['min'], max: max as Bounds['max'] };
}

export interface GroundEvidence {
  source: 'inferred' | 'explicit';
  top: number;
  nodeId?: string;
  area?: number;
}

export interface ValidateOptions {
  checks?: readonly CheckCode[];
  tolerance?: number;
  ignore?: readonly string[];
  bounds?: Bounds;
  groundY?: number;
  semantics?: boolean;
}

export interface ValidateResult {
  issues: SceneIssue[];
  groundY: number;
  groundEvidence?: GroundEvidence;
  warning?: string;
  stats: SceneStats;
}

const DEFAULT_CHECKS: readonly CheckCode[] = ['floating', 'intersect', 'belowGround'];
const EPS = 1e-9;

function isSolid(node: { kind: string }): boolean {
  return node.kind === 'mesh' || node.kind === 'model';
}

function inferGround(
  doc: SceneDoc,
  tolerance: number,
): { groundY: number; evidence?: GroundEvidence; warning?: string } {
  const boxes: { id: string; box: Bounds }[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (!node.visible || !isSolid(node)) continue;
    const box = nodeBounds(doc, node.id);
    if (box) boxes.push({ id: node.id, box });
  }
  if (!boxes.length) {
    return { groundY: 0, warning: '场景没有实体节点，groundY 回退 0' };
  }
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { box } of boxes) {
    minY = Math.min(minY, box.min[1]);
    maxY = Math.max(maxY, box.max[1]);
  }
  const band = Math.max(tolerance, 0.25 * (maxY - minY));
  let best: { id: string; area: number; top: number } | undefined;
  for (const { id, box } of boxes) {
    const height = box.max[1] - box.min[1];
    const span = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2], 1);
    if (height > span * 0.1 + EPS) continue;
    if (box.max[1] > minY + band) continue;
    const area = (box.max[0] - box.min[0]) * (box.max[2] - box.min[2]);
    if (area <= EPS) continue;
    if (!best || area > best.area || (area === best.area && box.max[1] < best.top)) {
      best = { id, area, top: box.max[1] };
    }
  }
  if (!best) {
    return { groundY: 0, warning: '未找到可作地面的水平面，groundY 回退 0（可显式传 groundY）' };
  }
  return {
    groundY: best.top,
    evidence: { source: 'inferred', nodeId: best.id, area: best.area, top: best.top },
  };
}

function overlap(a: Bounds, b: Bounds, tolerance: number): boolean {
  const x = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const y = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const z = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return x > tolerance && y > tolerance && z > tolerance;
}

function touching(a: Bounds, b: Bounds, tolerance: number): boolean {
  const x = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const y = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const z = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return x >= -tolerance && y >= -tolerance && z >= -tolerance;
}

function outside(box: Bounds, bounds: Bounds, tolerance: number): boolean {
  for (const axis of [0, 1, 2] as const) {
    if (box.min[axis] < bounds.min[axis] - tolerance) return true;
    if (box.max[axis] > bounds.max[axis] + tolerance) return true;
  }
  return false;
}

const norm = (p: readonly number[]): number => Math.hypot(p[0]!, p[1]!, p[2]!);

function auditSemantics(doc: SceneDoc, tolerance: number, ignore: Set<string>): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const children = new Map<string, SceneNode[]>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.parent) continue;
    const list = children.get(node.parent);
    if (list) list.push(node);
    else children.set(node.parent, [node]);
  }

  for (const node of Object.values(doc.nodes)) {
    if (!node.visible || !node.parent || ignore.has(node.id) || ignore.has(node.parent)) continue;
    const parent = doc.nodes[node.parent];
    if (!parent || !parent.visible || !isSolid(parent)) continue;
    const parentBox = nodeOwnBounds(doc, parent.id);
    const childBox = nodeBounds(doc, node.id);
    if (!parentBox || !childBox || overlap(parentBox, childBox, tolerance)) continue;
    issues.push({
      code: 'orphan-child',
      nodeIds: [node.id, parent.id],
      severity: 'warn',
      detail: `${node.name} 的世界包围盒完全落在实体父节点 ${parent.name} 之外`,
      fixHint: '核对父节点的 transform，或用 node.reparent 保持世界坐标重新挂载',
      bounds: unionBounds([childBox, parentBox]),
    });
  }

  const groups = Object.values(doc.nodes)
    .filter((node) => node.kind === 'group' && !ignore.has(node.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const g of groups) {
    const kids = children.get(g.id) ?? [];
    if (!kids.length) continue;
    const s = g.transform.s;
    const nonUnit = s.some((v) => Math.abs(v - 1) > 0.05);
    const suspect = s.some((v) => v < 0.2 - EPS || v > 5 + EPS);
    if (suspect) {
      issues.push({
        code: 'suspect-scale',
        nodeIds: [g.id],
        severity: 'warn',
        detail: `${g.name} 的缩放 [${s.map((v) => v.toFixed(2)).join(', ')}] 超出 [0.2, 5]`,
        fixHint: '把缩放烘进子节点几何，或拆成更小的组；异常缩放会放大后续变换误差',
        bounds: nodeBounds(doc, g.id) ?? undefined,
      });
    }

    if (nonUnit) {
      const suspects = kids.filter(
        (child) => child.visible && !ignore.has(child.id) && norm(child.transform.p) > 1,
      );
      if (suspects.length > 0) {
        issues.push({
          code: 'mixed-semantics',
          nodeIds: [g.id, ...suspects.map((child) => child.id)],
          severity: 'warn',
          detail: `${g.name} 缩放 [${s.map((v) => v.toFixed(2)).join(', ')}] 下仍有 ${suspects.length} 个子节点以大于 1 的局部 p 定位`,
          fixHint: '用 node.group keepWorld 重新归一化，或把子节点 p 减去组锚点',
          bounds: unionBounds([nodeBounds(doc, g.id), ...suspects.map((child) => nodeBounds(doc, child.id))]),
        });
      }
    }

    const visibleKids = kids.filter((child) => child.visible && !ignore.has(child.id));
    if (visibleKids.length < 4) continue;
    const values = visibleKids
      .map((child) => ({ child, value: norm(child.transform.p) }))
      .filter((entry) => entry.value > EPS)
      .sort((a, b) => a.value - b.value);
    if (values.length < 4) continue;
    let split = -1;
    let gap = 0;
    for (let i = 1; i < values.length; i += 1) {
      const step = Math.log10(values[i]!.value / values[i - 1]!.value);
      if (step > gap) {
        gap = step;
        split = i;
      }
    }
    if (split < 2 || values.length - split < 2 || gap < 1.5) continue;
    issues.push({
      code: 'bimodal-local',
      nodeIds: visibleKids.map((child) => child.id),
      severity: 'warn',
      detail: `${g.name} 的子节点 |p| 从 ${values[split - 1]!.value.toFixed(2)} 跳到 ${values[split]!.value.toFixed(2)}（${Math.round(10 ** gap)}×），量级双峰`,
      fixHint: '检查是否一部分子节点用局部坐标、另一部分用世界坐标；统一到组局部坐标系',
      bounds: unionBounds(visibleKids.map((child) => nodeBounds(doc, child.id))),
    });
  }

  return issues;
}

export function validateScene(doc: SceneDoc, opts: ValidateOptions = {}): ValidateResult {
  const tolerance = opts.tolerance ?? 0.02;
  const checks = new Set(opts.checks ?? DEFAULT_CHECKS);
  const ignore = new Set(opts.ignore ?? []);
  const inferred = opts.groundY === undefined ? inferGround(doc, tolerance) : undefined;
  const groundY = opts.groundY ?? inferred?.groundY ?? 0;
  const groundEvidence: GroundEvidence | undefined =
    opts.groundY === undefined ? inferred?.evidence : { source: 'explicit', top: opts.groundY };
  const warning = inferred?.warning;
  const issues: SceneIssue[] = [];

  const solid: { node: SceneNode; box: Bounds }[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (!node.visible || !isSolid(node) || ignore.has(node.id)) continue;
    const box = nodeBounds(doc, node.id);
    if (box) solid.push({ node, box });
  }
  solid.sort((a, b) =>
    a.node.name === b.node.name ? (a.node.id < b.node.id ? -1 : 1) : a.node.name < b.node.name ? -1 : 1,
  );

  if (checks.has('floating')) {
    const supported = new Set<string>();
    const queue: { node: SceneNode; box: Bounds }[] = [];
    for (const item of solid) {
      if (item.box.min[1] <= groundY + tolerance) {
        supported.add(item.node.id);
        queue.push(item);
      }
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const candidate of solid) {
        if (supported.has(candidate.node.id)) continue;
        if (touching(cur.box, candidate.box, tolerance)) {
          supported.add(candidate.node.id);
          queue.push(candidate);
        }
      }
    }
    for (const { node, box } of solid) {
      if (!supported.has(node.id)) {
        issues.push({
          code: 'floating',
          nodeIds: [node.id],
          severity: 'warn',
          detail: `${node.name} 最低点 ${box.min[1].toFixed(3)} 高于地面 ${groundY.toFixed(3)} 且未与受支撑节点接触`,
          fixHint: '下移节点使其接触地面/底座，或把 ignore 加入豁免（如吊灯、悬空装饰）',
          bounds: box,
        });
      }
    }
  }

  if (checks.has('belowGround')) {
    for (const { node, box } of solid) {
      if (box.max[1] < groundY - tolerance) {
        issues.push({
          code: 'belowGround',
          nodeIds: [node.id],
          severity: 'error',
          detail: `${node.name} 完全沉入地面以下（顶面 ${box.max[1].toFixed(3)} < ${groundY.toFixed(3)}）`,
          fixHint: '上移节点，或检查 transform.p 的 y 是否为负值',
          bounds: box,
        });
      }
    }
  }

  if (checks.has('intersect')) {
    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        const a = solid[i];
        const b = solid[j];
        if (!a || !b) continue;
        if (overlap(a.box, b.box, tolerance)) {
          issues.push({
            code: 'intersect',
            nodeIds: [a.node.id, b.node.id],
            severity: 'warn',
            detail: `${a.node.name} 与 ${b.node.name} 包围盒重叠`,
            fixHint: '移开其中一个节点，或用 node.get 核对世界包围盒',
            bounds: unionBounds([a.box, b.box]),
          });
        }
      }
    }
  }

  if (checks.has('outsideBounds') && opts.bounds) {
    for (const { node, box } of solid) {
      if (outside(box, opts.bounds, tolerance)) {
        issues.push({
          code: 'outsideBounds',
          nodeIds: [node.id],
          severity: 'warn',
          detail: `${node.name} 超出给定范围`,
          fixHint: '把节点移回 bounds 内，或放宽 bounds',
          bounds: box,
        });
      }
    }
  }

  if (opts.semantics) issues.push(...auditSemantics(doc, tolerance, ignore));

  return {
    issues,
    groundY,
    ...(groundEvidence ? { groundEvidence } : {}),
    ...(warning ? { warning } : {}),
    stats: sceneStats(doc),
  };
}
