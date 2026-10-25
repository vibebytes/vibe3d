import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server';

describe('vibe3d_help 不依赖 daemon', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  afterEach(() => write.mockClear());

  it('daemon 不可用时仍返回参数契约', async () => {
    let asked = 0;
    const server = createServer({
      runtime: async () => {
        asked += 1;
        throw new Error('daemon 启动失败');
      },
    });
    await server.handle({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'vibe3d_help', arguments: { tool: 'vibe3d_node', op: 'create' } },
    });
    const payload = JSON.parse(String(write.mock.calls.at(-1)?.[0]));
    const body = JSON.parse(payload.result.content[0].text);
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
    const server = createServer({
      runtime: async () => {
        throw new Error('daemon 启动失败');
      },
    });
    await server.handle({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'vibe3d_help', arguments: { tool: 'vibe3d_node', op: 'node.create' } },
    });
    const payload = JSON.parse(String(write.mock.calls.at(-1)?.[0]));
    const body = JSON.parse(payload.result.content[0].text);
    expect(body.ops[0].capability).toBe('node.create');
    expect(body.fields.some((line: string) => line.includes('node.kind'))).toBe(true);
  });

  it('apply_ops 的 help 认 ops[] 成员名', async () => {
    const server = createServer({
      runtime: async () => {
        throw new Error('daemon 启动失败');
      },
    });
    await server.handle({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'vibe3d_help', arguments: { tool: 'vibe3d_apply_ops', op: 'material.set' } },
    });
    const payload = JSON.parse(String(write.mock.calls.at(-1)?.[0]));
    const body = JSON.parse(payload.result.content[0].text);
    expect(body.usage).toContain('ops[]');
    expect(body.fields[0]).toContain('material.set');
    expect(JSON.parse(body.example).op).toBe('material.set');
  });
});
