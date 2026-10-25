import { MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { schemaSnapshot } from '../src/schema';
import { listTools } from '../src/tools';

describe('schema snapshot', () => {
  it('is byte-identical to the tools/list payload the LLM sees', () => {
    expect(schemaSnapshot().tools).toEqual(listTools());
  });

  it('carries one op contract group per tool, with unique names', () => {
    const snap = schemaSnapshot();
    expect(snap.ops.map((o) => o.tool)).toEqual(MCP_TOOLS.map((t) => t.name));
    const names = snap.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of snap.tools) {
      expect(tool.name).toMatch(/^vibe3d_/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});
