import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
  mcpName: string;
  description: string;
};
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
  description: string;
  repository: { url: string; source: string };
  packages: Array<{ identifier: string; version: string }>;
};

describe('MCP registry metadata', () => {
  it('mcpName、仓库与版本一致', () => {
    expect(pkg.mcpName).toBe('io.github.vibebytes/vibe3d');
    expect(server.name).toBe(pkg.mcpName);
    expect(server.repository.url).toBe('https://github.com/vibebytes/vibe3d');
    expect(server.repository.source).toBe('github');
    expect(server.version).toBe(pkg.version);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(pkg.description.length).toBeLessThanOrEqual(100);
    expect(server.packages[0]?.identifier).toBe(pkg.name);
    expect(server.packages[0]?.version).toBe(pkg.version);
  });
});
