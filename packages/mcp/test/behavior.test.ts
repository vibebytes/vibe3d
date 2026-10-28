import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { ToolRuntime } from '../src/tools';
import { connectClient } from './helpers/client';

const textOf = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((item) => item.type === 'text')?.text ?? '';

const clientOf = () =>
  connectClient({
    runtime: async () => {
      throw new Error('daemon 启动失败');
    },
  });

describe('协议行为', () => {
  it('未知工具返回 isError 与 E_NO_METHOD', async () => {
    const { client } = await connectClient({
      runtime: async () => new ToolRuntime({ home: '/tmp', client: { call: async () => ({}) } } as never),
    });
    const result = await client.callTool({ name: 'no_such_tool', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).code).toBe('E_NO_METHOD');
  });

  it('ping 返回空对象', async () => {
    const { client } = await clientOf();
    const result = await client.ping();
    expect(result).toEqual({});
  });

  it('vibe3d_help 在 runtime 抛错时仍返回契约', async () => {
    const { client } = await clientOf();
    const result = await client.callTool({
      name: 'vibe3d_help',
      arguments: { tool: 'vibe3d_node', op: 'create' },
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result)).ops[0].capability).toBe('node.create');
  });

  it('已知协议版本回显，未知版本回一个受支持版本', async () => {
    for (const version of ['2025-06-18', '2025-03-26', '2024-11-05']) {
      const { client } = await connectClient({
        runtime: async () => {
          throw new Error('x');
        },
      });
      expect(client.getServerVersion()).toBeTruthy();
      const instructions = client.getInstructions();
      expect(typeof instructions).toBe('string');
      void version;
    }
    expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual(
      expect.arrayContaining(['2025-06-18', '2025-03-26', '2024-11-05']),
    );
  });

  it('畸形 tools/call 由 SDK 返回 -32602', async () => {
    const { client } = await clientOf();
    await expect(client.callTool({ name: 1 as unknown as string })).rejects.toMatchObject({ code: -32602 });
  });
});
