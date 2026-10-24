import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

interface Spec {
  mcp?: { tool: string };
}

const registry = CAPABILITIES as unknown as Record<string, Spec>;

const declared = Object.entries(registry)
  .filter(([, spec]) => spec.mcp)
  .map(([capability, spec]) => ({ capability, tool: (spec.mcp as { tool: string }).tool }));

const served = listTools().map((tool) => tool.name);

const docPath = fileURLToPath(new URL('../../../../agent/docs/vibe3d/vibe3d-packages.md', import.meta.url));

function docToolCount(): number {
  const lines = readFileSync(docPath, 'utf8').split('\n');
  const header = lines.findIndex((line) => line.includes('| 能力 |'));
  let count = 0;
  for (const line of lines.slice(header + 1)) {
    if (!/^\|\s*`/.test(line)) continue;
    const mcpCell = line.split('|')[3] ?? '';
    if (/`vibe3d_[a-z_]+`/.test(mcpCell)) count += 1;
  }
  return count;
}

describe('tools/list 与 capabilities 注册表对齐', () => {
  it('注册表里声明的工具名不重复', () => {
    const names = declared.map((item) => item.tool);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tools/list 长度等于注册表声明数', () => {
    expect(served.length).toBe(declared.length);
  });

  it('两侧工具名集合完全一致：缺一个或多一个都失败', () => {
    expect([...served].sort()).toEqual(declared.map((item) => item.tool).sort());
  });

  it('tools/list 每一项都能回溯到唯一能力', () => {
    for (const tool of MCP_TOOLS) {
      expect(registry[tool.capability]?.mcp?.tool, tool.name).toBe(tool.name);
    }
  });

  it.skipIf(!existsSync(docPath))('文档 §1.2 的能力表计数与 tools/list 一致', () => {
    expect(docToolCount()).toBe(served.length);
  });
});
