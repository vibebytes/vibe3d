import { PassThrough } from 'node:stream';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

async function initialize(protocolVersion: string): Promise<string> {
  const input = new PassThrough();
  const output = new PassThrough();
  let raw = '';
  output.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  const server = createServer({
    runtime: async () => {
      throw new Error('x');
    },
  });
  await server.connect(new StdioServerTransport(input, output));
  input.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion, capabilities: {}, clientInfo: { name: 't', version: '0' } },
    })}\n`,
  );
  const deadline = Date.now() + 1000;
  while (!raw.includes('"protocolVersion"') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  input.end();
  const line = raw.split('\n').find((item) => item.includes('"protocolVersion"'));
  const message = JSON.parse(line ?? '{}') as { result?: { protocolVersion?: string } };
  return message.result?.protocolVersion ?? '';
}

describe('协议版本协商', () => {
  it('请求受支持版本时回显', async () => {
    expect(await initialize('2025-06-18')).toBe('2025-06-18');
    expect(await initialize('2025-03-26')).toBe('2025-03-26');
    expect(await initialize('2024-11-05')).toBe('2024-11-05');
  });

  it('未知版本回一个 SDK 受支持的版本', async () => {
    const chosen = await initialize('1999-01-01');
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(chosen);
  });
});
