import { createInterface } from 'node:readline';
import { getPrompt, listPrompts } from './guide';
import type { ToolResult, ToolRuntime } from './tools';
import { listTools } from './tools';

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
  log?: (line: string) => void;
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
          '任务剧本按需加载：prompts 里的 vibe3d.build / edit / render / verify / import / history，只在需要完整步骤时读，不要要求一次性返回全部工具 spec。'
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
      let result: ToolResult;
      try {
        const runtime = await deps.runtime();
        result = await runtime.call(name, args);
      } catch (err) {
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'E_NO_DAEMON',
                message: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
          isError: true,
        };
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
      const task = handle(req).catch((err: unknown) => {
        fail(req.id ?? null, { code: -32603, message: err instanceof Error ? err.message : String(err) });
      });
      inflight.add(task);
      void task.finally(() => inflight.delete(task));
    });
    rl.on('close', () => {
      void Promise.allSettled([...inflight]).then(() => process.exit(0));
    });
  }

  return { start };
}
