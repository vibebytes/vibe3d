import { appendFileSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;

function logPath(): string | undefined {
  if (process.env.VIBE3D_MCP_LOG === '0') return undefined;
  const home = process.env.VIBE3D_HOME
    ?? process.env.VIBE3D_MCP_HOME
    ?? join(process.env.HOME ?? '/tmp', '.vibe3d');
  return join(home, 'mcp.log');
}

let path: string | undefined | null = null;

function resolved(): string | undefined {
  if (path === null) {
    path = logPath();
    if (path) {
      try {
        mkdirSync(join(path, '..'), { recursive: true });
      } catch {
        path = undefined;
      }
    }
    if (path) {
      try {
        if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`);
      } catch {
        // 首次运行文件尚不存在，跳过轮转
      }
    }
  }
  return path;
}

export function logEvent(fields: Record<string, unknown>): void {
  const file = resolved();
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), ...fields })}\n`);
  } catch {
    path = undefined;
  }
}
