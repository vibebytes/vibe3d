import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, MCP_LEGACY_ALIASES, MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

const served = listTools()
  .map((tool) => tool.name)
  .filter((name) => name !== 'vibe3d_help');

const opCount = MCP_TOOLS.reduce((total, tool) => total + tool.ops.length, 0);

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

describe('tools/list 与 capabilities 分组表对齐', () => {
  it('分组工具名不重复', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tools/list 长度等于分组数', () => {
    expect(served.length).toBe(MCP_TOOLS.length);
  });

  it('两侧工具名集合完全一致：缺一个或多一个都失败', () => {
    expect([...served].sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
  });

  it('每个 op 回溯到唯一能力，且全部能力都被覆盖', () => {
    const seen = new Set<string>();
    for (const tool of MCP_TOOLS) {
      for (const op of tool.ops) {
        expect(CAPABILITIES[op.capability], `${tool.name}#${op.op}`).toBeDefined();
        expect(seen.has(op.capability), op.capability).toBe(false);
        seen.add(op.capability);
      }
    }
    expect(seen.size).toBe(Object.keys(CAPABILITIES).length);
  });

  it('旧工具名别名都指向存在的分组工具与 op', () => {
    for (const [legacy, target] of Object.entries(MCP_LEGACY_ALIASES)) {
      const tool = MCP_TOOLS.find((item) => item.name === target.tool);
      expect(tool, legacy).toBeDefined();
      expect(
        tool?.ops.some((op) => op.op === target.op),
        legacy,
      ).toBe(true);
    }
    const flatCount = MCP_TOOLS.filter((tool) => tool.ops.length === 1).length;
    expect(Object.keys(MCP_LEGACY_ALIASES).length).toBe(opCount - flatCount);
  });

  it.skipIf(!existsSync(docPath))('文档 §1.2 的能力行数与 op 总数一致', () => {
    expect(docToolCount()).toBe(opCount);
  });
});
