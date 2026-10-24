import type { SceneStats } from './stats';

export type BudgetKey = 'maxNodes' | 'maxTris' | 'maxTextures';

export interface SceneBudget {
  maxNodes?: number;
  maxTris?: number;
  maxTextures?: number;
}

export interface BudgetMetric {
  limit: number;
  used: number;
  remaining: number;
  ratio: number;
  exceeded: boolean;
}

export interface BudgetReport {
  over: BudgetKey[];
  metrics: Record<BudgetKey, BudgetMetric | null>;
  hint?: string;
}

const KEYS: BudgetKey[] = ['maxNodes', 'maxTris', 'maxTextures'];

const LABELS: Record<BudgetKey, string> = {
  maxNodes: '节点',
  maxTris: '三角面',
  maxTextures: '贴图',
};

function usedOf(stats: SceneStats, key: BudgetKey): number {
  if (key === 'maxNodes') return stats.nodes;
  if (key === 'maxTris') return stats.tris;
  return stats.textures;
}

export function checkBudget(stats: SceneStats, budget: SceneBudget): BudgetReport {
  const over: BudgetKey[] = [];
  const metrics = {} as Record<BudgetKey, BudgetMetric | null>;
  const parts: string[] = [];

  for (const key of KEYS) {
    const limit = budget[key];
    if (limit === undefined) {
      metrics[key] = null;
      continue;
    }
    const used = usedOf(stats, key);
    const remaining = limit - used;
    const exceeded = remaining < 0;
    const ratio = limit === 0 ? (used === 0 ? 0 : 1) : Math.round((used / limit) * 100) / 100;
    metrics[key] = { limit, used, remaining, ratio, exceeded };
    if (exceeded) {
      over.push(key);
      parts.push(`${LABELS[key]}超出 ${used - limit}`);
    } else {
      parts.push(`${LABELS[key]}余量 ${remaining}`);
    }
  }

  return { over, metrics, hint: parts.length > 0 ? parts.join('；') : undefined };
}
