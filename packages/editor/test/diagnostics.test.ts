import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls, validateResult } = vi.hoisted(() => ({
  calls: [] as Array<[string, Record<string, unknown>, string]>,
  validateResult: {
    issues: [
      {
        code: 'floating',
        nodeIds: ['n_00000002'],
        severity: 'warn',
        detail: '悬浮 0.5',
        fixHint: '下移',
        bounds: { min: [0, 1, 0], max: [1, 2, 1] },
      },
      {
        code: 'belowGround',
        nodeIds: ['n_00000003'],
        severity: 'error',
        detail: '沉地',
        fixHint: '上移',
        bounds: { min: [0, -2, 0], max: [1, -1, 1] },
      },
    ],
    groundY: 0,
    stats: {
      nodes: 3,
      byKind: { mesh: 3, group: 0, light: 0, model: 0 },
      meshes: 3,
      tris: 12,
      materials: 1,
      textures: 0,
      drawCallsEst: 3,
    },
  },
}));

vi.mock('../src/lib/rpc', () => ({
  rpc: async (method: string, params: Record<string, unknown>, roomId: string) => {
    calls.push([method, params, roomId]);
    if (method === 'scene.validate') return validateResult;
    if (method === 'scene.get') return { doc: emptyDoc('t') };
    return { revision: 2, camera: emptyDoc('t').camera, cameras: {} };
  },
}));

const { useDoc } = await import('../src/stores/doc');
const { ISSUE_LABELS, sortIssues, summarize, useDiagnostics } = await import('../src/stores/diagnostics');
const { useSelection } = await import('../src/stores/selection');

beforeEach(() => {
  calls.length = 0;
  useDoc.setState({ roomId: 'r_00000001', doc: emptyDoc('t') });
  useDiagnostics.getState().clear();
  useSelection.getState().reset();
});

describe('诊断面板 store', () => {
  it('run 调 scene.validate 并按错误优先排序', async () => {
    await useDiagnostics.getState().run();
    expect(calls[0]?.[0]).toBe('scene.validate');
    expect(calls[0]?.[2]).toBe('r_00000001');
    expect(useDiagnostics.getState().issues.map((i) => i.code)).toEqual(['belowGround', 'floating']);
    expect(useDiagnostics.getState().groundY).toBe(0);
    expect(useDiagnostics.getState().running).toBe(false);
  });

  it('sortIssues 错误在前，同级保持稳定', () => {
    const sorted = sortIssues([
      { code: 'floating', nodeIds: [], severity: 'warn', detail: '', fixHint: '' },
      { code: 'belowGround', nodeIds: [], severity: 'error', detail: '', fixHint: '' },
      { code: 'intersect', nodeIds: [], severity: 'warn', detail: '', fixHint: '' },
    ]);
    expect(sorted.map((i) => i.code)).toEqual(['belowGround', 'floating', 'intersect']);
  });

  it('summarize 汇总数目', () => {
    expect(summarize(validateResult.issues as never)).toEqual({ errors: 1, warns: 1, total: 2 });
    expect(summarize([])).toEqual({ errors: 0, warns: 0, total: 0 });
  });

  it('ISSUE_LABELS 覆盖全部 8 个 code', () => {
    for (const code of [
      'floating',
      'intersect',
      'belowGround',
      'outsideBounds',
      'orphan-child',
      'suspect-scale',
      'mixed-semantics',
      'bimodal-local',
    ]) {
      expect(ISSUE_LABELS[code], code).toBeTruthy();
    }
  });

  it('focus 选中节点并按 bounds 跳相机', async () => {
    await useDiagnostics.getState().run();
    calls.length = 0;
    const issue = useDiagnostics.getState().issues.find((i) => i.code === 'belowGround')!;
    await useDiagnostics.getState().focus(issue);
    expect(calls.some(([m, p]) => m === 'camera.set' && p.bbox === issue.bounds && p.padding === 1.6)).toBe(true);
    expect(useSelection.getState().ids).toEqual(['n_00000003']);
  });

  it('issue 无 bounds 时只选中、不动相机', async () => {
    await useDiagnostics.getState().run();
    calls.length = 0;
    const issue = { ...useDiagnostics.getState().issues[0]!, bounds: undefined };
    await useDiagnostics.getState().focus(issue);
    expect(calls.some(([m]) => m === 'camera.set')).toBe(false);
    expect(useSelection.getState().ids).toEqual(['n_00000003']);
  });

  it('clear 清空结果', async () => {
    await useDiagnostics.getState().run();
    useDiagnostics.getState().clear();
    expect(useDiagnostics.getState().issues).toEqual([]);
    expect(useDiagnostics.getState().groundY).toBeNull();
  });
});
