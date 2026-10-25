import { readFile } from 'node:fs/promises';

export interface RepairFixCount {
  fix: string;
  count: number;
}

export interface RepairToolStat {
  tool: string;
  capability: string;
  count: number;
  fixes: RepairFixCount[];
}

export interface RepairStatsDoc {
  version: 1;
  updatedAt: string;
  firstSeenAt: string;
  total: number;
  tools: RepairToolStat[];
}

export interface RepairStatsLoaded {
  doc: RepairStatsDoc;
  corrupt: boolean;
}

export const REPAIR_STATS_FILE = 'mcp-repair-stats.json';

const epoch = new Date(0).toISOString();

export const emptyRepairStats = (): RepairStatsDoc => ({
  version: 1,
  updatedAt: epoch,
  firstSeenAt: epoch,
  total: 0,
  tools: [],
});

const isToolStat = (value: unknown): value is RepairToolStat => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<RepairToolStat>;
  return typeof row.tool === 'string' && typeof row.count === 'number' && Array.isArray(row.fixes);
};

export async function loadRepairStats(file: string): Promise<RepairStatsLoaded> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return { doc: emptyRepairStats(), corrupt: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RepairStatsDoc>;
    const tools = Array.isArray(parsed.tools) ? parsed.tools.filter(isToolStat) : [];
    return {
      doc: {
        version: 1,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : epoch,
        firstSeenAt: typeof parsed.firstSeenAt === 'string' ? parsed.firstSeenAt : epoch,
        total: typeof parsed.total === 'number' ? parsed.total : 0,
        tools,
      },
      corrupt: false,
    };
  } catch {
    return { doc: emptyRepairStats(), corrupt: true };
  }
}
