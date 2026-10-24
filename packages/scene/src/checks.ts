import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { type Bounds, nodeBounds } from './frame';
import { type SceneStats, sceneStats } from './stats';

export type CheckCode = 'floating' | 'intersect' | 'belowGround' | 'outsideBounds';

export interface SceneIssue {
  code: CheckCode;
  nodeIds: string[];
  severity: 'warn' | 'error';
  detail: string;
  fixHint: string;
}

export interface ValidateOptions {
  checks?: readonly CheckCode[];
  tolerance?: number;
  ignore?: readonly string[];
  bounds?: Bounds;
}

export interface ValidateResult {
  issues: SceneIssue[];
  groundY: number;
  stats: SceneStats;
}

const DEFAULT_CHECKS: readonly CheckCode[] = ['floating', 'intersect', 'belowGround'];
const EPS = 1e-9;

function isSolid(node: { kind: string }): boolean {
  return node.kind === 'mesh' || node.kind === 'model';
}

function groundLevel(doc: SceneDoc, tolerance: number): number {
  let groundY = 0;
  let found = false;
  for (const node of Object.values(doc.nodes)) {
    if (!node.visible || !isSolid(node)) continue;
    const box = nodeBounds(doc, node.id);
    if (!box) continue;
    const height = box.max[1] - box.min[1];
    const span = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2], 1);
    if (height > span * 0.1 + EPS) continue;
    if (!found || box.max[1] > groundY) {
      groundY = box.max[1];
      found = true;
    }
  }
  return groundY;
}

function overlap(a: Bounds, b: Bounds, tolerance: number): boolean {
  const x = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const y = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const z = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return x > tolerance && y > tolerance && z > tolerance;
}

function outside(box: Bounds, bounds: Bounds, tolerance: number): boolean {
  for (const axis of [0, 1, 2] as const) {
    if (box.min[axis] < bounds.min[axis] - tolerance) return true;
    if (box.max[axis] > bounds.max[axis] + tolerance) return true;
  }
  return false;
}

export function validateScene(doc: SceneDoc, opts: ValidateOptions = {}): ValidateResult {
  const tolerance = opts.tolerance ?? 0.02;
  const checks = new Set(opts.checks ?? DEFAULT_CHECKS);
  const ignore = new Set(opts.ignore ?? []);
  const groundY = groundLevel(doc, tolerance);
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
    for (const { node, box } of solid) {
      if (box.min[1] > groundY + tolerance) {
        issues.push({
          code: 'floating',
          nodeIds: [node.id],
          severity: 'warn',
          detail: `${node.name} 最低点 ${box.min[1].toFixed(3)} 高于地面 ${groundY.toFixed(3)}`,
          fixHint: '下移节点使其接触地面，或把 ignore 加入豁免（如吊灯、悬空装饰）',
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
        });
      }
    }
  }

  return { issues, groundY, stats: sceneStats(doc) };
}
