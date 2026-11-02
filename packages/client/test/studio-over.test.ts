import { describe, expect, it } from 'vitest';
import { mockTransport } from '../src/mock';
import { Studio } from '../src/studio';
import type { CallOptions } from '../src/transport';

describe('Studio.over', () => {
  it('用 mock 传输发出能力调用', async () => {
    const seen: { method: string; params: Record<string, unknown> }[] = [];
    const transport = mockTransport({
      dispatch: async (method, params) => {
        seen.push({ method, params });
        return { node: { id: 'n1' } };
      },
    });
    const studio = Studio.over(transport);
    await studio.room('r1').getNode('n1');
    expect(seen).toEqual([{ method: 'node.get', params: { nodeId: 'n1', roomId: 'r1' } }]);
  });

  it('把 opts.roomId 透传给 dispatch', async () => {
    const seen: { params: Record<string, unknown>; opts?: CallOptions }[] = [];
    const transport = mockTransport({
      dispatch: async (_method, params, opts) => {
        seen.push({ params, opts });
        return {};
      },
    });
    const studio = Studio.over(transport);
    await studio.room('r1').getNode('n1');
    expect(seen[0]?.params.roomId).toBe('r1');
    expect(seen[0]?.opts?.roomId).toBe('r1');
  });
});
