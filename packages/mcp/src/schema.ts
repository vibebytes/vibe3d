import { MCP_TOOLS, describeCapability } from '@vibebyte/vibe3d-capabilities';
import { ALIAS_NOTE, listTools } from './tools';

export const MCP_SCHEMA_KIND = 'vibe3d.mcp.schema';
export const MCP_SCHEMA_VERSION = '1';

export interface McpSchemaFile {
  kind: string;
  schemaVersion: string;
  generatedAt: string;
  note: string;
  tools: ReturnType<typeof listTools>;
  ops: Array<{ tool: string; ops: unknown[] }>;
}

export function schemaSnapshot(now: Date = new Date()): McpSchemaFile {
  return {
    kind: MCP_SCHEMA_KIND,
    schemaVersion: MCP_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    note: ALIAS_NOTE,
    tools: listTools(),
    ops: MCP_TOOLS.map((tool) => ({
      tool: tool.name,
      ops: tool.ops.map((entry) => describeCapability(entry.capability)),
    })),
  };
}
