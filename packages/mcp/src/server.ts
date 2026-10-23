import { createInterface } from 'node:readline';
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
  'prompts/list': { prompts: [] },
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
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          '用 vibe3d_create_room 开房，再以 room_id 调 scene/node/render 等工具；省略 room_id 时使用最近创建的房间。',
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
    let queue: Promise<void> = Promise.resolve();
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
      const task = queue
        .then(() => handle(req))
        .catch((err: unknown) => {
          fail(req.id ?? null, { code: -32603, message: err instanceof Error ? err.message : String(err) });
        });
      queue = task;
      inflight.add(task);
      void task.finally(() => inflight.delete(task));
    });
    rl.on('close', () => {
      void Promise.allSettled([...inflight]).then(() => process.exit(0));
    });
  }

  return { start };
}
