import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface McpSchemaLoaded {
  ok: true;
  tools: unknown[];
  snapshot: Record<string, unknown>;
  generatedAt?: string;
  stale: boolean;
  bytes: number;
}

export interface McpSchemaFailure {
  ok: false;
  code: 'E_SCHEMA_MISSING' | 'E_SCHEMA_INVALID';
  message: string;
}

const builtAfter = async (file: string, schemaMtimeMs: number): Promise<boolean> => {
  try {
    const built = await stat(join(dirname(file), 'index.js'));
    return built.mtimeMs > schemaMtimeMs + 1000;
  } catch {
    return false;
  }
};

export async function loadMcpSchema(file: string): Promise<McpSchemaLoaded | McpSchemaFailure> {
  let raw: string;
  let mtimeMs: number;
  try {
    const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    raw = text;
    mtimeMs = info.mtimeMs;
  } catch {
    return {
      ok: false,
      code: 'E_SCHEMA_MISSING',
      message: `没有 MCP schema 快照：${file}。先跑 scripts/rebuild.sh mcp（构建后会自动生成）。`,
    };
  }

  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'E_SCHEMA_INVALID', message: `MCP schema 快照不是合法 JSON：${file}` };
  }

  const tools = snapshot.tools;
  if (!Array.isArray(tools)) {
    return { ok: false, code: 'E_SCHEMA_INVALID', message: `MCP schema 快照缺少 tools[]：${file}` };
  }

  const generatedAt = typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : undefined;
  return {
    ok: true,
    tools,
    snapshot,
    generatedAt,
    stale: await builtAfter(file, mtimeMs),
    bytes: Buffer.byteLength(JSON.stringify({ tools })),
  };
}
