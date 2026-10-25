import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

describe('advertised tool schemas 是合规的 JSON Schema 2020-12', () => {
  const tools = listTools();

  it('不含 tuple 形式的 items（"items": [）', () => {
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema), tool.name).not.toContain('"items": [');
    }
  });

  it('顶层声明 2020-12 方言（含 LOOSE 覆盖的工具）', () => {
    for (const tool of tools) {
      const schema = tool.inputSchema as { $schema?: string };
      expect(schema.$schema, tool.name).toBe(DIALECT);
    }
  });

  it('分组信封保留 op 枚举与唯一必填字段', () => {
    const camera = tools.find((tool) => tool.name === 'vibe3d_camera');
    const schema = camera?.inputSchema as {
      properties?: { op?: { enum?: string[] } };
      required?: string[];
    };
    expect(schema.properties?.op?.enum).toContain('set');
    expect(schema.required).toEqual(['op']);
  });
});
