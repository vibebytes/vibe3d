import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls } = vi.hoisted(() => ({
  calls: [] as Array<[string, Record<string, unknown>, string]>,
}));

vi.mock('../src/lib/rpc', () => ({
  rpc: async (method: string, params: Record<string, unknown>, roomId: string) => {
    calls.push([method, params, roomId]);
    if (method === 'room.timeline') {
      return {
        revision: 3,
        entries: [{ opId: 'op_b', revision: 3, summary: 'node.update', ops: 1 }],
      };
    }
    if (method === 'scene.get') return { doc: emptyDoc('t') };
    return { revision: 4 };
  },
}));

const { useDoc } = await import('../src/stores/doc');
const { useTimeline } = await import('../src/stores/timeline');

beforeEach(() => {
  calls.length = 0;
  useDoc.setState({ roomId: 'r_00000001', doc: emptyDoc('t') });
  useTimeline.getState().clear();
});

describe('op 时间线 store', () => {
  it('run 拉取 room.timeline 并保存 entries', async () => {
    await useTimeline.getState().run();
    expect(calls[0]?.[0]).toBe('room.timeline');
    expect(calls[0]?.[2]).toBe('r_00000001');
    expect(useTimeline.getState().entries).toHaveLength(1);
    expect(useTimeline.getState().entries[0].opId).toBe('op_b');
    expect(useTimeline.getState().revision).toBe(3);
    expect(useTimeline.getState().running).toBe(false);
  });

  it('undoTo 调 scene.undo{opId} 后刷新文档与时间线', async () => {
    await useTimeline.getState().undoTo('op_b');
    const undoCall = calls.find(([m, p]) => m === 'scene.undo' && p.opId === 'op_b');
    expect(undoCall).toBeTruthy();
    expect(calls.some(([m]) => m === 'room.timeline')).toBe(true);
    expect(useDoc.getState().doc).toEqual(emptyDoc('t'));
  });

  it('无 roomId 时不发请求', async () => {
    useDoc.setState({ roomId: null });
    await useTimeline.getState().run();
    expect(calls).toHaveLength(0);
  });
});
