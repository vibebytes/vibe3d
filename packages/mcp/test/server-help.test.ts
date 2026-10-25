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
  });
});
