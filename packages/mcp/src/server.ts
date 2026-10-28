import { INVALID_PARAMS, ProtocolError, Server } from '@modelcontextprotocol/server';
import { type ServerDeps, callTool } from './core';
import { getPrompt, listPrompts } from './guide';
import { INSTRUCTIONS } from './instructions';
import { listTools } from './tools';
import { mcpVersion } from './version';

interface CallExtra {
  mcpReq?: { signal?: AbortSignal };
}

interface HandlerReq {
  params?: { name?: string; arguments?: unknown };
}

type LooseHandler = (method: string, handler: (req: HandlerReq, ctx: CallExtra) => unknown) => void;

export function createServer(deps: ServerDeps): Server {
  const server = new Server(
    { name: 'vibe3d', version: mcpVersion(), title: 'vibe3d 3D 场景' },
    {
      capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
      instructions: INSTRUCTIONS,
    },
  );
  const on = server.setRequestHandler.bind(server) as unknown as LooseHandler;
  on('tools/list', async () => ({ tools: listTools() }));
  on('prompts/list', async () => ({ prompts: listPrompts() }));
  on('prompts/get', async (req) => {
    try {
      return getPrompt(String(req.params?.name ?? ''));
    } catch (err) {
      throw new ProtocolError(INVALID_PARAMS, err instanceof Error ? err.message : String(err));
    }
  });
  on('tools/call', async (req, extra) =>
    callTool(deps, String(req.params?.name ?? ''), req.params?.arguments ?? {}, {
      signal: extra.mcpReq?.signal,
      logLine: (line) => {
        process.stderr.write(`${line}\n`);
      },
    }),
  );
  return server;
}

export type { ServerDeps };
