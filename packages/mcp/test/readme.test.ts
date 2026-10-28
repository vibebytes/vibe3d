import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
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
    expect(readme).toContain('Node.js >= 22');
    expect(readme).toContain('VIBE3D_TOKEN');
    expect(readme).not.toMatch(/--token\s/);
    expect(readme).toContain('Windows');
    expect(readme).toContain('Not verified');
  });
});
