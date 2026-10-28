import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

describe('stdin 关闭', () => {
  it('stdin 结束后中止进行中的调用，不再补写响应', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let raw = '';
    let seen: AbortSignal | undefined;
    output.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
    });
    const server = createServer({
      runtime: async () =>
        ({
          call: async (_name: string, _args: unknown, opts?: { signal?: AbortSignal }) => {
            seen = opts?.signal;
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 500);
              opts?.signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              });
            });
            return { content: [{ type: 'text', text: 'slow-ok' }] };
          },
        }) as never,
    });
    await server.connect(new StdioServerTransport(input, output));
    const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'vibe3d_status', arguments: {} } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    input.end();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(raw).toContain('"protocolVersion"');
    expect(seen?.aborted).toBe(true);
    expect(raw).not.toContain('slow-ok');
  });
});
