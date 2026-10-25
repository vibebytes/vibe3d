import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

export interface RepairEvent {
  tool: string;
  capability: string;
  fixes: readonly string[];
}

const FILE = 'mcp-repair-stats.json';
const MAX_TOOLS = 50;
const MAX_FIXES = 20;
const PERSIST_DEBOUNCE_MS = 200;

let total = 0;
let firstSeenAt: string | undefined;
let updatedAt: string | undefined;
const tools = new Map<string, { capability: string; count: number; fixes: Map<string, number> }>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> | undefined;
let dir: string | undefined;

export function statsFile(home: string): string {
  return join(home, FILE);
}

function defaultHome(): string {
  return process.env.VIBE3D_HOME ?? join(homedir(), '.vibe3d');
}

function rank<T extends { count: number }>(entries: T[]): T[] {
  return entries.sort((a, b) => b.count - a.count);
}

export function snapshotRepairStats(): RepairStatsDoc {
  const rows = rank(
    [...tools.entries()].map(([tool, entry]) => ({
      tool,
      capability: entry.capability,
      count: entry.count,
      fixes: rank([...entry.fixes.entries()].map(([fix, count]) => ({ fix, count }))).slice(0, MAX_FIXES),
    })),
  ).slice(0, MAX_TOOLS);
  return {
    version: 1,
    updatedAt: updatedAt ?? new Date().toISOString(),
    firstSeenAt: firstSeenAt ?? new Date().toISOString(),
    total,
    tools: rows,
  };
}

function persist(): Promise<void> {
  const home = dir ?? defaultHome();
  const file = statsFile(home);
  const body = JSON.stringify(snapshotRepairStats(), null, 2);
  pending = (async () => {
    try {
      mkdirSync(home, { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, body);
      renameSync(tmp, file);
      for (const listener of listeners) listener();
    } catch {
      // 账本写不进去不能影响工具调用
    }
  })();
  return pending;
}

export function recordRepair(event: RepairEvent, home?: string): void {
  if (home) dir = home;
  const now = new Date().toISOString();
  firstSeenAt ??= now;
  updatedAt = now;
  total += 1;
  const entry = tools.get(event.tool) ?? { capability: event.capability, count: 0, fixes: new Map<string, number>() };
  entry.capability = event.capability;
  entry.count += 1;
  for (const fix of event.fixes) entry.fixes.set(fix, (entry.fixes.get(fix) ?? 0) + 1);
  tools.set(event.tool, entry);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void persist();
  }, PERSIST_DEBOUNCE_MS);
  timer.unref?.();
}

export async function flushRepairStats(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (total === 0 && !pending) return;
  await persist();
}

export async function readRepairStats(file: string): Promise<RepairStatsDoc> {
  const empty: RepairStatsDoc = {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    firstSeenAt: new Date(0).toISOString(),
    total: 0,
    tools: [],
  };
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Partial<RepairStatsDoc>;
    if (!Array.isArray(doc.tools)) return empty;
    return { ...empty, ...doc, version: 1, tools: doc.tools };
  } catch {
    return empty;
  }
}

export function onRepairStatsWritten(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetRepairStats(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  pending = undefined;
  total = 0;
  firstSeenAt = undefined;
  updatedAt = undefined;
  dir = undefined;
  tools.clear();
  listeners.clear();
}
