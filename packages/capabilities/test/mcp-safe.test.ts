import { describe, expect, it } from 'vitest';
import { JSON_SCHEMA_DIALECT, generateFiles, mcpSafe } from '../src/gen/generate';

describe('mcpSafe: tuple items 折叠为单 schema', () => {
  it('同构 tuple → items 单 schema + 补齐 min/max', () => {
    expect(
      mcpSafe({ type: 'array', items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }] }),
    ).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 3,
      maxItems: 3,
    });
  });

  it('异构 tuple → items anyOf + 补齐 min/max', () => {
    expect(mcpSafe({ type: 'array', items: [{ type: 'string' }, { type: 'number' }] })).toEqual({
      type: 'array',
      items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      minItems: 2,
      maxItems: 2,
    });
  });

  it('已声明的 minItems/maxItems 优先', () => {
    expect(
      mcpSafe({ type: 'array', minItems: 1, maxItems: 9, items: [{ type: 'string' }, { type: 'string' }] }),
    ).toEqual({ type: 'array', minItems: 1, maxItems: 9, items: { type: 'string' } });
  });

  it('递归处理 properties 与嵌套 items', () => {
    const out = mcpSafe({
      type: 'object',
      properties: {
        nested: { type: 'array', items: [{ type: 'integer' }, { type: 'integer' }] },
      },
    }) as { properties: { nested: { items: unknown; minItems?: number } } };
    expect(out.properties.nested.items).toEqual({ type: 'integer' });
    expect(out.properties.nested.minItems).toBe(2);
  });

  it('非数组 items 与标量原样透传', () => {
    expect(mcpSafe({ type: 'array', items: { type: 'object' } })).toEqual({
      type: 'array',
      items: { type: 'object' },
    });
    expect(mcpSafe('text')).toBe('text');
    expect(mcpSafe(null)).toBeNull();
  });

  it('内嵌 draft-07 $schema 统一改写为 2020-12', () => {
    const out = mcpSafe({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
    }) as { $schema?: string };
    expect(out.$schema).toBe(JSON_SCHEMA_DIALECT);
  });
});

describe('生成的 mcp.ts 不含 tuple items', () => {
  it('全部工具 schema 序列化后无 "items": [', () => {
    const mcp = generateFiles()['mcp.ts'] ?? '';
    expect(mcp).not.toContain('"items": [');
  });

  it('全部工具顶层声明 2020-12 方言', () => {
    const mcp = generateFiles()['mcp.ts'] ?? '';
    const count = mcp.split(JSON_SCHEMA_DIALECT).length - 1;
    const tools = mcp.split('inputSchema:').length - 1;
    expect(count).toBeGreaterThanOrEqual(tools);
  });
});
