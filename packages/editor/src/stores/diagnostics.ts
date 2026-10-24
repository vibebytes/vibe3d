import { create } from 'zustand';
import { rpc } from '../lib/rpc';
import { useDoc } from './doc';
import { useSelection } from './selection';

export const ISSUE_LABELS: Record<string, string> = {
  floating: '悬浮',
  intersect: '穿模',
  belowGround: '沉地',
  outsideBounds: '出界',
  'orphan-child': '游离子级',
  'suspect-scale': '异常缩放',
  'mixed-semantics': '混合坐标语义',
  'bimodal-local': '局部坐标双峰',
};

export interface DiagnosticsIssue {
  code: string;
  nodeIds: string[];
  severity: 'warn' | 'error';
  detail: string;
  fixHint: string;
  bounds?: { min: [number, number, number]; max: [number, number, number] };
}

export interface IssueSummary {
  errors: number;
  warns: number;
  total: number;
}

export function sortIssues(issues: DiagnosticsIssue[]): DiagnosticsIssue[] {
  return [...issues].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

export function summarize(issues: readonly DiagnosticsIssue[]): IssueSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  return { errors, warns: issues.length - errors, total: issues.length };
}

interface DiagnosticsStore {
  issues: DiagnosticsIssue[];
  groundY: number | null;
  running: boolean;
  error: string | null;
  run(): Promise<void>;
  focus(issue: DiagnosticsIssue): Promise<void>;
  clear(): void;
}

export const useDiagnostics = create<DiagnosticsStore>((set) => ({
  issues: [],
  groundY: null,
  running: false,
  error: null,

  async run() {
    const roomId = useDoc.getState().roomId;
    if (!roomId) return;
    set({ running: true, error: null });
    try {
      const res = await rpc('scene.validate', { semantics: true }, roomId);
      set({ issues: sortIssues(res.issues), groundY: res.groundY });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: false });
    }
  },

  async focus(issue) {
    const roomId = useDoc.getState().roomId;
    if (!roomId || !issue.nodeIds.length) return;
    useSelection.getState().set(issue.nodeIds);
    if (!issue.bounds) return;
    await rpc('camera.set', { bbox: issue.bounds, padding: 1.6 }, roomId);
    await useDoc.getState().refresh();
  },

  clear() {
    set({ issues: [], groundY: null, error: null });
  },
}));
