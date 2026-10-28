import { describe, expect, it } from 'vitest';
import { connectClient } from './helpers/client';

const textOf = (result: { content: Array<{ type: string; text?: string }> }): string => {
  const block = result.content.find((item) => item.type === 'text');
  return block?.text ?? '';
};

describe('vibe3d_help 不依赖 daemon', () => {
  it('daemon 不可用时仍返回参数契约', async () => {
    let asked = 0;
    const { client } = await connectClient({
      runtime: async () => {
        asked += 1;
        throw new Error('daemon 启动失败');
      },
    });
    const result = await client.callTool({
      name: 'vibe3d_help',
      arguments: { tool: 'vibe3d_node', op: 'create' },
    });
    const body = JSON.parse(textOf(result));
    expect(asked).toBe(0);
    expect(body.ops[0].capability).toBe('node.create');
    expect(body.ops[0].params.some((p: { name: string }) => p.name === 'kind')).toBe(true);
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.some((line: string) => line.includes('geometry'))).toBe(true);
    const fieldLine = (path: string): string =>
      body.fields.find((line: string) => line.startsWith(`${path}：`)) ?? '';
    expect(fieldLine('node.name')).toContain('必填');
    expect(fieldLine('node.transform')).toContain('必填');
    expect(fieldLine('node.geometry')).toContain('可选');
    expect(fieldLine('node.geometry')).toContain('kind=mesh');
    expect(fieldLine('node.geometry.height')).toContain('type=cylinder');
    expect(JSON.parse(body.example).op).toBe('node.create');
  });

  it('vibe3d_help 也接受全名 op', async () => {
    const { client } = await connectClient({
      runtime: async () => {
        throw new Error('daemon 启动失败');
      },
    });
    const result = await client.callTool({
      name: 'vibe3d_help',
      arguments: { tool: 'vibe3d_node', op: 'node.create' },
    });
    const body = JSON.parse(textOf(result));
    expect(body.ops[0].capability).toBe('node.create');
    expect(body.fields.some((line: string) => line.includes('node.kind'))).toBe(true);
  });

  it('apply_ops 的 help 认 ops[] 成员名', async () => {
    const { client } = await connectClient({
      runtime: async () => {
        throw new Error('daemon 启动失败');
      },
    });
    const result = await client.callTool({
      name: 'vibe3d_help',
      arguments: { tool: 'vibe3d_apply_ops', op: 'material.set' },
    });
    const body = JSON.parse(textOf(result));
    expect(body.usage).toContain('ops[]');
    expect(body.fields[0]).toContain('material.set');
    expect(JSON.parse(body.example).op).toBe('material.set');
  });
});
