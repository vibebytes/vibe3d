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

  it('被折叠的数组仍保留长度约束（set_camera 的三元组）', () => {
    const camera = tools.find((tool) => tool.name === 'vibe3d_set_camera');
    expect(camera).toBeDefined();
    expect(JSON.stringify(camera?.inputSchema)).toContain('"minItems":3');
  });
});
