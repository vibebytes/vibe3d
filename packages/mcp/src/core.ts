import { isVibe3DError } from '@vibebyte/vibe3d-client';
import { logEvent } from './log';
import {
  DAEMON_LINK_CODES,
  HELP_TOOL,
  type ToolResult,
  type ToolRuntime,
  callTimeoutMs,
  helpResult,
} from './tools';

export interface ServerDeps {
  runtime: () => Promise<ToolRuntime>;
  onRuntimeError?: (err: unknown) => void;
}

export interface CallContext {
  signal?: AbortSignal;
  logLine?: (line: string) => void;
}

function isConnectionError(err: unknown): boolean {
  return isVibe3DError(err) && DAEMON_LINK_CODES.has(err.code);
}

export function normalizeResult(result: ToolResult): ToolResult {
  const structured = result.structuredContent;
  if (structured === undefined) return result;
  if (structured !== null && typeof structured === 'object' && !Array.isArray(structured)) return result;
  return { ...result, structuredContent: { value: structured } };
}

function cancelledResult(): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code: 'E_CANCELLED', message: '调用已取消' }) }],
    isError: true,
  };
}

function errorResult(err: unknown): ToolResult {
  return normalizeResult({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          code: isVibe3DError(err) ? err.code : 'E_NO_DAEMON',
          message: err instanceof Error ? err.message : String(err),
        }),
      },
    ],
    isError: true,
  });
}

export async function callTool(
  deps: ServerDeps,
  name: string,
  args: unknown,
  ctx: CallContext = {},
): Promise<ToolResult> {
  const startedAt = Date.now();
  const invoke = async (): Promise<ToolResult> => {
    if (name === HELP_TOOL.name) return normalizeResult(helpResult(args));
    try {
      return normalizeResult(await (await deps.runtime()).call(name, args, { signal: ctx.signal }));
    } catch (err) {
      if (ctx.signal?.aborted) throw err;
      if (!deps.onRuntimeError || !isConnectionError(err)) throw err;
      deps.onRuntimeError(err);
      logEvent({ event: 'mcp.reconnect-retry', tool: name });
      return normalizeResult(await (await deps.runtime()).call(name, args, { signal: ctx.signal }));
    }
  };
  const task = invoke();
  task.catch(() => {});
  const budget = callTimeoutMs() + 45_000 + 30_000;
  let watchTimer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    watchTimer = setTimeout(() => reject(new Error('mcp-watchdog')), budget);
    watchTimer.unref?.();
  });
  let result: ToolResult;
  try {
    result = await Promise.race([task, watchdog]);
  } catch (err) {
    if (ctx.signal?.aborted) {
      result = cancelledResult();
    } else if (err instanceof Error && err.message === 'mcp-watchdog') {
      ctx.logLine?.(JSON.stringify({ event: 'mcp.watchdog', tool: name, budgetMs: budget }));
      logEvent({ event: 'mcp.watchdog', tool: name, budgetMs: budget });
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 'E_TIMEOUT',
              message: `tools/call 总兜底超时：${name} 超过 ${budget}ms 无响应，已放弃本次响应。请重试；若连续超时，查 ~/.vibe3d/daemon.log 并重启 daemon。`,
            }),
          },
        ],
        isError: true,
      };
    } else {
      if (deps.onRuntimeError && isConnectionError(err)) deps.onRuntimeError(err);
      result = errorResult(err);
    }
  } finally {
    if (watchTimer) clearTimeout(watchTimer);
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed > 5_000) {
    ctx.logLine?.(JSON.stringify({ event: 'mcp.slow', tool: name, elapsedMs: elapsed }));
    logEvent({ event: 'mcp.slow', tool: name, elapsedMs: elapsed });
  }
  return result;
}
