import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = new URL('../src/', import.meta.url);

describe('协议壳使用官方 SDK', () => {
  it('业务源文件不再手写 stdio JSON-RPC', () => {
    const allow = new Set(['schema-cli.ts', 'doctor.ts']);
    for (const name of readdirSync(src)) {
      if (!name.endsWith('.ts') || allow.has(name)) continue;
      const text = readFileSync(new URL(name, src), 'utf8');
      expect(text, name).not.toContain("from 'node:readline'");
      expect(text, name).not.toMatch(/process\.stdout\.write\(`\$\{JSON\.stringify/);
    }
  });

  it('server.ts 引用官方 server 包', () => {
    const text = readFileSync(new URL('server.ts', src), 'utf8');
    expect(text).toContain('@modelcontextprotocol/server');
  });
});
