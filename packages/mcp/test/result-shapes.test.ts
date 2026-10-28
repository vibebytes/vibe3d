import { isCallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { normalizeResult } from '../src/core';
import { helpResult } from '../src/tools';
import { connectClient } from './helpers/client';

describe('tools/call 结果形态', () => {
  it('help、文本、对象 structuredContent 与图片都通过官方结果校验', async () => {
    expect(isCallToolResult(helpResult({ tool: 'vibe3d_node', op: 'create' }))).toBe(true);
    const { client } = await connectClient({
      runtime: async () =>
        ({
          call: async (name: string) => {
            if (name === 'vibe3d_render') {
              return {
                content: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
                structuredContent: { width: 1, height: 1 },
              };
            }
            return {
              content: [{ type: 'text', text: '{"ok":true}' }],
              structuredContent: { ok: true },
              isError: false,
            };
          },
        }) as never,
    });
    expect(isCallToolResult(await client.callTool({ name: 'vibe3d_status', arguments: {} }))).toBe(true);
    expect(
      isCallToolResult(await client.callTool({ name: 'vibe3d_render', arguments: { op: 'snapshot' } })),
    ).toBe(true);
  });

  it('非对象 structuredContent 会被包成对象', () => {
    const wrapped = normalizeResult({
      content: [{ type: 'text', text: '[]' }],
      structuredContent: [1, 2],
    });
    expect(wrapped.structuredContent).toEqual({ value: [1, 2] });
    expect(isCallToolResult(wrapped)).toBe(true);
  });
});
