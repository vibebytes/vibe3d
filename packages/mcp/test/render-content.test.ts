import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { ToolRuntime } from '../src/tools';

const shot = (view: string) => ({ view, mime: 'image/png', base64: `B64-${view}`, width: 8, height: 8 });

function studioReturning(result: unknown): Studio {
  const handle = {
    id: 'r_0000000a',
    invoke: async (method: string) =>
      method === 'room.get' ? { roomId: 'r_0000000a', name: 'x', revision: 1, nodeCount: 0 } : result,
  };
  return {
    client: { call: async () => ({ revision: 1 }) },
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: () => handle,
  } as unknown as Studio;
}

describe('render results carry images as MCP image blocks', () => {
  it('render.views returns one image block per view and no base64 in text', async () => {
    const result = {
      revision: 3,
      target: { min: [0, 0, 0], max: [1, 1, 1] },
      views: [shot('front'), shot('top')],
    };
    const runtime = new ToolRuntime(studioReturning(result), 'r_0000000a');
    const out = await runtime.call('vibe3d_render', { op: 'views', views: ['front', 'top'] });
    expect(out.isError).toBeFalsy();
    const images = out.content.filter((c) => c.type === 'image') as Array<{ data: string }>;
    expect(images.map((i) => i.data)).toEqual(['B64-front', 'B64-top']);
    const text = out.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    expect(text.join('\n')).not.toContain('B64-');
    const meta = JSON.parse(text[0] ?? '{}');
    expect(meta.views.map((v: { image: number }) => v.image)).toEqual([1, 2]);
    expect(JSON.stringify(out.structuredContent)).not.toContain('B64-');
  });

  it('render.node returns its single shot as an image block', async () => {
    const result = { revision: 3, nodeId: 'n_abcdef12', ...shot('right') };
    const runtime = new ToolRuntime(studioReturning(result), 'r_0000000a');
    const out = await runtime.call('vibe3d_render', { op: 'node', node_id: 'n_abcdef12' });
    expect(out.content[0]).toMatchObject({ type: 'image', data: 'B64-right', mimeType: 'image/png' });
    expect(JSON.stringify(out.content.slice(1))).not.toContain('B64-');
  });
});
