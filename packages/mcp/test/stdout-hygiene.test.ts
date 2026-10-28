import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);

describe('stdout 只包含 JSON-RPC', () => {
  it('握手、help 与不可达 daemon 时每一行都是 JSON-RPC', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe3d-stdout-'));
    const child = spawn(
      process.execPath,
      [
        join(root.pathname, 'node_modules/tsx/dist/cli.mjs'),
        'packages/mcp/src/index.ts',
        '--url',
        'http://127.0.0.1:9',
        '--autostart',
        'false',
      ],
      { cwd: root.pathname, env: { ...process.env, VIBE3D_HOME: home } },
    );
    const lines: string[] = [];
    child.stdout.setEncoding('utf8');
    let buf = '';
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) if (line.trim()) lines.push(line);
    });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'vibe3d_help', arguments: {} } });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vibe3d_status', arguments: {} } });
    const deadline = Date.now() + 8000;
    while (
      lines.filter((line) => line.includes('"id":2') || line.includes('"id": 2')).length === 0 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    child.kill();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const message = JSON.parse(line) as { jsonrpc?: string };
      expect(message.jsonrpc).toBe('2.0');
    }
  });
});
