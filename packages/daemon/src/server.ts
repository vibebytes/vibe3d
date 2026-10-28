import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { BlobStore } from './assets/blobstore';
import type { Config } from './config';
import type { DispatchContext } from './context';
import { toRpcFailure } from './http/errors';
import { signExportUrl } from './http/export-url';
import { allowSandboxedFrame, hostGuard, requestId } from './http/middleware';
import { type RouteDeps, mountRoutes, serveEditorAsset, serveVendorAsset } from './http/routes';
import type { Logger } from './logger';
import { ThumbsStore } from './thumbs';
import type { WsHub } from './ws/hub';

export interface AppDeps {
  config: Config;
  ctx: DispatchContext;
  blobs: BlobStore;
  logger: Logger;
  editorDir: string;
  exportsDir: string;
  hub?: WsHub;
  mcpSchemaFile?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MCP_SCHEMA_FILE =
  process.env.VIBE3D_MCP_SCHEMA ?? join(here, '../../mcp/dist/schema.json');

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use('*', requestId());
  app.use('*', hostGuard());

  deps.ctx.exportsDir ??= deps.exportsDir;
  deps.ctx.signExport ??= (file: string) => signExportUrl(deps.config.token, file);
  deps.ctx.thumbs ??= new ThumbsStore({ getRenderer: (c) => c.renderer });

  const routes: RouteDeps = {
    ctx: deps.ctx,
    token: deps.config.token,
    blobs: deps.blobs,
    logger: deps.logger,
    editorDir: deps.editorDir,
    exportsDir: deps.exportsDir,
    limits: { rate: deps.config.rateLimit, burst: deps.config.rateBurst },
    hub: deps.hub,
    mcpSchemaFile: deps.mcpSchemaFile ?? DEFAULT_MCP_SCHEMA_FILE,
    home: deps.config.home,
  };
  mountRoutes(app, routes);

  app.get('/editor/*', allowSandboxedFrame(), (c) =>
    serveEditorAsset(routes, c.req.path.slice('/editor/'.length)),
  );
  app.get('/vendor/*', allowSandboxedFrame(), (c) =>
    serveVendorAsset(routes, c.req.path.slice('/vendor/'.length)),
  );

  // Sandboxed iframes preflight every cross-origin POST; answer before auth so the
  // browser never sees a 401 on OPTIONS.
  app.options('*', allowSandboxedFrame(), (c) => c.body(null, 204));

  app.notFound((c) => json({ error: { code: 'E_NO_METHOD', message: `无此路由：${c.req.path}` } }, 404));

  app.onError((err, c) => {
    const failure = toRpcFailure(err);
    if (failure.body.data.code === 'E_INTERNAL') {
      deps.logger.error({ event: 'http.error', path: c.req.path, err: String(err) });
    }
    return json({ jsonrpc: '2.0', id: null, error: failure.body }, failure.status);
  });

  return app;
}
