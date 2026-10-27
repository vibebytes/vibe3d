import { createInterface } from 'node:readline';
import { isVibe3DError } from '@vibebyte/vibe3d-client';
import { getPrompt, listPrompts } from './guide';
import { logEvent } from './log';
import type { ToolResult, ToolRuntime } from './tools';
import { HELP_TOOL, callTimeoutMs, helpResult, listTools } from './tools';

process.on('uncaughtException', (err) => {
  logEvent({ event: 'uncaught', err: err.stack ?? String(err) });
});
process.on('unhandledRejection', (reason) => {
  logEvent({ event: 'unhandledRejection', err: reason instanceof Error ? reason.stack ?? reason.message : String(reason) });
});
process.stdout.on('error', (err) => {
  logEvent({ event: 'stdout.error', err: String(err) });
});
process.stdout.on('close', () => {
  logEvent({ event: 'stdout.close' });
});
process.stdin.on('error', (err) => {
  logEvent({ event: 'stdin.error', err: String(err) });
});

logEvent({
  event: 'boot',
  pid: process.pid,
  ppid: process.ppid,
  node: process.version,
  entry: process.argv[1] ?? '',
});

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(sig, () => {
    logEvent({ event: 'signal', sig });
    process.exit(0);
  });
}

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'vibe3d', version: '0.1.0', title: 'vibe3d 3D 场景' };

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

const METHODS_UNAVAILABLE: Record<string, unknown> = {
  'resources/list': { resources: [] },
  'resources/templates/list': { resourceTemplates: [] },
};

export interface ServerDeps {
  runtime: () => Promise<ToolRuntime>;
  onRuntimeError?: (err: unknown) => void;
  log?: (line: string) => void;
}

const CONNECTION_CODES = new Set<string>([
  'E_NETWORK',
  'E_NO_DAEMON',
  'E_UNAUTHORIZED',
  'E_DAEMON_OUTDATED',
  'E_PROTOCOL',
]);

function isConnectionError(err: unknown): boolean {
  return isVibe3DError(err) && CONNECTION_CODES.has(err.code);
}

function summarizeArgs(args: unknown): string | undefined {
  if (args === undefined || args === null) return undefined;
  try {
    const text = JSON.stringify(args);
    return text.length > 200 ? `${text.slice(0, 200)}...` : text;
  } catch {
    return undefined;
  }
}

export function createServer(deps: ServerDeps) {
  const write = (payload: unknown): void => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };
  const reply = (id: RpcRequest['id'], result: unknown): void => {
    write({ jsonrpc: '2.0', id: id ?? null, result });
  };
  const fail = (id: RpcRequest['id'], error: RpcError): void => {
    write({ jsonrpc: '2.0', id: id ?? null, error });
  };

  async function handle(req: RpcRequest): Promise<void> {
    if (req.id === undefined) return;
    if (req.method === 'initialize') {
      const requested = typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : '';
      reply(req.id, {
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          '房间由会话绑定：先 vibe3d_create_room 建房（自动绑定当前会话），或用 vibe3d_get_room / vibe3d_open_editor 传 room_id 切换；此后 scene / node / asset / render 类工具都不要传 room_id。\n' +
          '参数约定：长度单位米，Y 轴向上；颜色一律 [r,g,b,a] 四位、0..1（缺 alpha 自动补 1，也接受 "#RRGGBB"）。\n' +
          'id 由服务端生成：node=n_、material=m_、fx=f_、room=r_ + 8 位小写字母数字；专用工具会返回 id，不要自己编。\n' +
          '逐条操作用专用工具（create_node / update_node / create_material / set_environment / create_fx）；vibe3d_apply_ops 只用于原子批量或需要引用新建 id 的依赖场景。\n' +
          '任务剧本按需加载：prompts 里的 vibe3d.build / edit / render / verify / import / history，只在需要完整步骤时读，不要要求一次性返回全部工具 spec。',
      });
      return;
    }
    if (req.method === 'ping') {
      reply(req.id, {});
      return;
    }
    if (req.method === 'tools/list') {
      reply(req.id, { tools: listTools() });
      return;
    }
    if (req.method === 'prompts/list') {
      reply(req.id, { prompts: listPrompts() });
      return;
    }
    if (req.method === 'prompts/get') {
      const name = String(req.params?.name ?? '');
      try {
        reply(req.id, getPrompt(name));
      } catch (err) {
        fail(req.id, { code: -32602, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    if (req.method === 'tools/call') {
      const name = String(req.params?.name ?? '');
      const args = req.params?.arguments ?? {};
      const startedAt = Date.now();
      const task = (async (): Promise<ToolResult> => {
        if (name === HELP_TOOL.name) return helpResult(args);
        const runtime = await deps.runtime();
        return runtime.call(name, args);
      })();
      task.catch(() => {});
      const budget = callTimeoutMs() + 30_000;
      let watchTimer: ReturnType<typeof setTimeout> | undefined;
      const watchdog = new Promise<never>((_, reject) => {
        watchTimer = setTimeout(() => reject(new Error('mcp-watchdog')), budget);
        watchTimer.unref?.();
      });
      let result: ToolResult;
      try {
        result = await Promise.race([task, watchdog]);
      } catch (err) {
        if (err instanceof Error && err.message === 'mcp-watchdog') {
          process.stderr.write(
            `${JSON.stringify({ event: 'mcp.watchdog', tool: name, budgetMs: budget })}\n`,
          );
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
          result = {
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
          };
        }
      } finally {
        if (watchTimer) clearTimeout(watchTimer);
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed > 5_000) {
        process.stderr.write(
          `${JSON.stringify({ event: 'mcp.slow', tool: name, elapsedMs: elapsed })}\n`,
        );
        logEvent({ event: 'mcp.slow', tool: name, elapsedMs: elapsed });
      }
      reply(req.id, result);
      return;
    }
    if (req.method in METHODS_UNAVAILABLE) {
      reply(req.id, METHODS_UNAVAILABLE[req.method]);
      return;
    }
    fail(req.id, { code: -32601, message: `Method not found: ${req.method}` });
  }

  function start(): void {
    const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
    const inflight = new Set<Promise<void>>();
    const hb = setInterval(() => {
      logEvent({ event: 'hb', rss: process.memoryUsage().rss, inflight: inflight.size });
    }, 30_000);
    hb.unref?.();
    rl.on('line', (line) => {
      const text = line.trim();
      if (!text) return;
      let req: RpcRequest;
      try {
        req = JSON.parse(text) as RpcRequest;
      } catch {
        fail(null, { code: -32700, message: 'Parse error' });
        return;
      }
      const startedAt = Date.now();
      const callMeta =
        req.method === 'tools/call'
          ? { tool: String(req.params?.name ?? ''), args: summarizeArgs(req.params?.arguments) }
          : {};
      logEvent({ event: 'req', id: req.id ?? null, method: req.method, ...callMeta });
      const task = handle(req)
        .catch((err: unknown) => {
          fail(req.id ?? null, { code: -32603, message: err instanceof Error ? err.message : String(err) });
        })
        .finally(() => {
          logEvent({ event: 'res', id: req.id ?? null, method: req.method, ...callMeta, ms: Date.now() - startedAt });
        });
      inflight.add(task);
      void task.finally(() => inflight.delete(task));
    });
    rl.on('close', () => {
      logEvent({ event: 'stdin.close', inflight: inflight.size });
      void Promise.allSettled([...inflight]).then(() => process.exit(0));
    });
  }

  return { start, handle };
}
