import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
const readmeCn = readFileSync(new URL('../../../README_CN.md', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string };

describe('README', () => {
  it('配置片段指向本包，并说明 Node、令牌与平台', () => {
    const blocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1] ?? '{}'),
    );
    const cursor = blocks.find((block) => block.mcpServers?.vibe3d);
    const vscode = blocks.find((block) => block.servers?.vibe3d);
    expect(cursor.mcpServers.vibe3d.args).toContain(pkg.name);
    expect(vscode.servers.vibe3d.args).toContain(pkg.name);
    expect(readme).toContain('Node.js >= 20');
    expect(readme).toMatch(/MCP TypeScript SDK v2/);
    expect(readme).not.toContain('VIBE3D_TOKEN');
    expect(readme).not.toMatch(/--token\s/);
    expect(readme).toContain('Windows');
    expect(readme).toContain('Not verified');
  });

  it('中英文 README 可互相跳转', () => {
    expect(readme).toContain('href="./README_CN.md"');
    expect(readme).toContain('简体中文');
    expect(readmeCn).toContain('href="./README.md"');
    expect(readmeCn).toContain('English');
    expect(readmeCn).toContain('Node.js >= 20');
    expect(readmeCn).toMatch(/MCP TypeScript SDK v2/);
    expect(readmeCn).not.toContain('VIBE3D_TOKEN');
  });
});

