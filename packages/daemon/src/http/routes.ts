import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CAPABILITIES, type CapabilityName } from '@vibebyte/vibe3d-capabilities';
import { AppError, type RoomId, isRoomId } from '@vibebyte/vibe3d-protocol';
import type { Context, Hono } from 'hono';
import type { BlobStore } from '../assets/blobstore';
import { parseGltf } from '../assets/gltf-parse';
import { classifyUpload } from '../assets/upload';
import type { DispatchContext } from '../context';
import { dispatch, hello } from '../dispatch';
import type { Logger } from '../logger';
import type { WsHub } from '../ws/hub';
import { toRpcFailure } from './errors';
import { EXPORT_FILE_RE, exportMime, verifyExportSig } from './export-url';
import { loadMcpSchema } from './mcp-schema';
import { SANDBOX_FRAME_HEADERS, allowSandboxedFrame } from './middleware';
import { TOKEN_COOKIE, bodyLimit, requireBearer, requireSurfaceToken, tokenMatches } from './middleware';
import { rateLimiter } from './ratelimit';
import { REPAIR_STATS_FILE, loadRepairStats } from './repair-stats';
import { SHOT_META_HEADER, parseShotMetaHeader } from './shot-meta';

export interface RouteDeps {
  ctx: DispatchContext;
  token: string | undefined;
  home: string;
  blobs: BlobStore;
  logger: Logger;
  editorDir: string;
  exportsDir: string;
  limits: { rate: number; burst: number };
  hub?: WsHub;
  mcpSchemaFile?: string;
}

interface Envelope {
  id: string | number | null;
  method: string;
  params: Record<string, unknown>;
}

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };

const STRICT_BASE: Record<string, string> = {
  'ops.apply': 'baseRevision',
  'scene.import': 'expectRevision',
};

function writeJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_TYPE, ...SANDBOX_FRAME_HEADERS },
  });
}

function reply(id: Envelope['id'], result: unknown): Response {
  return writeJson({ jsonrpc: '2.0', id, result });
}

function failResponse(id: Envelope['id'], err: unknown): Response {
  const failure = toRpcFailure(err);
  return writeJson({ jsonrpc: '2.0', id, error: failure.body }, failure.status);
}

async function readEnvelope(c: { req: { json: () => Promise<unknown> } }): Promise<Envelope> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError('E_PARSE', '请求体不是合法 JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('E_INVALID_REQUEST', '请求体必须是 JSON 对象');
  }
  const env = body as Record<string, unknown>;
  if (env.jsonrpc !== undefined && env.jsonrpc !== '2.0') {
    throw new AppError('E_INVALID_REQUEST', 'jsonrpc 必须为 "2.0"');
  }
  const id = env.id;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    throw new AppError('E_INVALID_REQUEST', 'id 必须是字符串或数字');
  }
  if (typeof env.method !== 'string' || env.method.length === 0) {
    throw new AppError('E_INVALID_REQUEST', '缺少 method');
  }
  return { id: id ?? null, method: env.method, params: (env.params ?? {}) as Record<string, unknown> };
}

function rpc(kind: 'control' | 'data', deps: RouteDeps, roomId?: string) {
  return async (c: Context) => {
    let envelope: Envelope = { id: null, method: '', params: {} };
    try {
      envelope = await readEnvelope(c);
      const method = envelope.method;
      const scope = method === 'hello' ? 'daemon' : CAPABILITIES[method as CapabilityName]?.scope;
      const batchIds = (envelope.params as { ids?: unknown }).ids;
      const crossRoomBatch = method === 'room.close' && Array.isArray(batchIds);
      if (kind === 'control' && scope !== 'daemon' && !crossRoomBatch) {
        throw new AppError('E_NO_METHOD', `控制面不接受方法：${method}`);
      }
      if (kind === 'data' && scope !== 'room') {
        throw new AppError('E_NO_METHOD', `数据面不接受方法：${method}`);
      }
      const params = roomId ? { ...envelope.params, roomId } : envelope.params;
      if (roomId && c.req.query('strict') === '1') {
        const field = STRICT_BASE[method];
        if (field && params[field] === undefined) {
          const room = deps.ctx.rooms.get(roomId);
          throw room.conflict(room.revision, 'missingBase');
        }
      }
      const result =
        method === 'hello'
          ? hello(deps.ctx)
          : await dispatch(method, params, {
              ...deps.ctx,
              baseUrl: new URL(c.req.url).origin,
            });
      return reply(envelope.id, result);
    } catch (err) {
      deps.logger.warn({ event: 'rpc.fail', method: envelope.method, err: String(err) });
      return failResponse(envelope.id, err);
    }
  };
}

export function mountRoutes(app: Hono, deps: RouteDeps): void {
  const { token, ctx } = deps;
  const rateLimit = rateLimiter({ rate: deps.limits.rate, burst: deps.limits.burst });

  app.get('/health', (c) =>
    writeJson({
      ok: true,
      version: hello(ctx).daemonVersion,
      protocolVersion: hello(ctx).protocolVersion,
      rooms: ctx.rooms.size,
      renderer: ctx.renderer?.name ?? 'none',
      schemaUrl: '/api/mcp/schema',
      repairStatsUrl: '/api/mcp/repair-stats',
      home: deps.home,
    }),
  );

  app.get('/api/mcp/schema', async (c) => {
    if (!deps.mcpSchemaFile) {
      return writeJson({ error: { code: 'E_SCHEMA_MISSING', message: '未配置 MCP schema 快照路径' } }, 404);
    }
    const loaded = await loadMcpSchema(deps.mcpSchemaFile);
    if (!loaded.ok) {
      return writeJson(
        { error: { code: loaded.code, message: loaded.message } },
        loaded.code === 'E_SCHEMA_MISSING' ? 404 : 500,
      );
    }
    const expand = ['1', 'true', 'yes', 'help', 'ops'].includes(String(c.req.query('expand') ?? ''));
    const pretty = c.req.query('pretty') !== '0';
    const body = expand ? loaded.snapshot : { tools: loaded.tools };
    return new Response(JSON.stringify(body, null, pretty ? 2 : 0), {
      status: 200,
      headers: {
        ...JSON_TYPE,
        'cache-control': 'no-store',
        'x-schema-tools': String(loaded.tools.length),
        'x-schema-bytes': String(loaded.bytes),
        ...(loaded.generatedAt ? { 'x-schema-generated-at': loaded.generatedAt } : {}),
        ...(loaded.stale ? { 'x-schema-stale': '1' } : {}),
      },
    });
  });

  app.get('/api/mcp/repair-stats', async (c) => {
    const { doc, corrupt } = await loadRepairStats(join(deps.home, REPAIR_STATS_FILE));
    const pretty = c.req.query('pretty') !== '0';
    return new Response(JSON.stringify(doc, null, pretty ? 2 : 0), {
      status: 200,
      headers: {
        ...JSON_TYPE,
        'cache-control': 'no-store',
        'x-repair-tools': String(doc.tools.length),
        'x-repair-total': String(doc.total),
        'x-repair-updated-at': doc.updatedAt,
        ...(corrupt ? { 'x-repair-corrupt': '1' } : {}),
      },
    });
  });

  app.post(
    '/rpc',
    allowSandboxedFrame(),
    requireBearer(token),
    rateLimit,
    bodyLimit(8 * 1024 * 1024),
    rpc('control', deps),
  );
  app.post(
    '/r/:roomId/rpc',
    allowSandboxedFrame(),
    requireBearer(token),
    rateLimit,
    bodyLimit(8 * 1024 * 1024),
    (c) => rpc('data', deps, c.req.param('roomId'))(c),
  );

  app.post('/r/:roomId/snapshot/:requestId', requireBearer(token), bodyLimit(64 * 1024 * 1024), async (c) => {
    const roomId = c.req.param('roomId');
    const requestId = c.req.param('requestId');
    if (!isRoomId(roomId)) throw new AppError('E_INVALID_PARAMS', 'roomId 非法');
    const hub = deps.hub;
    if (!hub) throw new AppError('E_RENDER_UNAVAILABLE', '快照上传通道未就绪');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) throw new AppError('E_INVALID_PARAMS', '快照内容为空');
    const mime = c.req.header('content-type') ?? 'image/png';
    const meta = parseShotMetaHeader(c.req.header(SHOT_META_HEADER));
    if (!hub.resolveSnapshotUpload(requestId, { bytes, mime, meta })) {
      throw new AppError('E_INVALID_PARAMS', '快照请求已过期');
    }
    deps.logger.debug({ event: 'snapshot.upload', roomId, requestId, bytes: bytes.length });
    return writeJson({ ok: true, bytes: bytes.length });
  });

  app.post('/r/:roomId/assets', requireBearer(token), bodyLimit(64 * 1024 * 1024), async (c) => {
    const room = ctx.rooms.get(c.req.param('roomId'));
    const form = await c.req.formData();
    const file = form.get('file') as unknown;
    if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
      throw new AppError('E_INVALID_PARAMS', '缺少 multipart 字段 file');
    }
    const blob = file as Blob;
    const filename = 'name' in blob ? String((blob as File).name || 'upload.glb') : 'upload.glb';
    const bytes = Buffer.from(await blob.arrayBuffer());
    const info = classifyUpload({ filename, mime: blob.type, bytes });
    const sha = await deps.blobs.put(bytes);
    const base = { sha, bytes: bytes.length, name: filename.slice(0, 300), mime: info.mime };
    if (info.kind === 'image') {
      const meta = room.registerAsset({ ...base, kind: 'image', image: info.image });
      return writeJson({ sha, bytes: bytes.length, kind: 'image', meta });
    }
    const report = parseGltf(bytes, filename);
    const meta = room.registerAsset({ ...base, kind: 'gltf', gltf: report });
    return writeJson({ sha, bytes: bytes.length, kind: 'gltf', meta, gltf: report });
  });

  app.get('/assets/:sha', async (c) => {
    const sha = c.req.param('sha');
    if (!/^[a-f0-9]{64}$/.test(sha)) throw new AppError('E_ASSET_MISSING', '非法 sha');
    const path = deps.blobs.path(sha);
    try {
      await stat(path);
    } catch {
      throw new AppError('E_ASSET_MISSING', `资产不存在：${sha}`);
    }
    return new Response(createReadStream(path) as unknown as ReadableStream, {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
  });

  app.get('/thumbs/:roomId/:revision/:file', (c) => {
    const roomId = c.req.param('roomId');
    const rev = c.req.param('revision');
    const file = c.req.param('file');
    const entry =
      /^\d+$/.test(rev) && /^[0-9a-f]{12}\.png$/.test(file)
        ? ctx.thumbs?.get(roomId, Number(rev), file.slice(0, 12))
        : undefined;
    if (!entry) throw new AppError('E_THUMB_MISSING', '缩略图不存在或已过期');
    return new Response(new Uint8Array(entry.bytes), {
      headers: { 'content-type': entry.mime, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  });

  app.get('/exports/:file', async (c) => {
    const file = c.req.param('file');
    if (!EXPORT_FILE_RE.test(file)) throw new AppError('E_JOB_NOT_FOUND', '非法导出文件名');
    const exp = Number(c.req.query('exp') ?? 0);
    const sig = c.req.query('sig') ?? '';
    if (token && (!verifyExportSig(token, file, exp, sig) || exp < Date.now())) {
      throw new AppError('E_UNAUTHORIZED', '导出链接无效或已过期');
    }
    const path = join(deps.exportsDir, file);
    try {
      await stat(path);
    } catch {
      throw new AppError('E_JOB_NOT_FOUND', `导出文件不存在：${file}`);
    }
    return new Response(createReadStream(path) as unknown as ReadableStream, {
      headers: {
        'content-type': exportMime(file),
        'content-disposition': `attachment; filename="${file}"`,
        'cache-control': 'private, max-age=600',
      },
    });
  });

  const withTokenCookie = (c: Context, res: Response): Response => {
    const query = c.req.query('t');
    if (token && query && tokenMatches(token, query)) {
      res.headers.append(
        'set-cookie',
        `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      );
    }
    return res;
  };

  const logSurfaceOpen = (c: Context, roomId: string | null): void => {
    deps.logger.info({
      event: 'surface.open',
      roomId,
      viaQueryToken: Boolean(c.req.query('t')),
      embedded: c.req.header('sec-fetch-dest') === 'iframe',
      ua: c.req.header('user-agent')?.slice(0, 120),
    });
  };

  app.get('/r/:roomId', requireSurfaceToken(token, { allowQuery: true, logger: deps.logger }), (c) => {
    const roomId = c.req.param('roomId');
    logSurfaceOpen(c, roomId);
    const search = new URL(c.req.url).search;
    return withTokenCookie(c, c.redirect(`/editor/r/${roomId}${search}`, 302));
  });

  app.get('/', requireSurfaceToken(token, { allowQuery: true, logger: deps.logger }), (c) => {
    logSurfaceOpen(c, null);
    const search = new URL(c.req.url).search;
    return withTokenCookie(c, c.redirect(`/editor/${search}`, 302));
  });
}

export async function serveEditor(c: Context, deps: RouteDeps, _roomId: RoomId | null): Promise<Response> {
  const index = join(deps.editorDir, 'index.html');
  try {
    await stat(index);
  } catch {
    throw new AppError('E_UNSUPPORTED', 'editor 未构建：请在 packages/editor 执行 pnpm build 后重试');
  }
  const html = await (await import('node:fs/promises')).readFile(index);
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const VENDOR_DIRS = new Set(['draco', 'basis', 'meshopt']);

export function serveVendorAsset(deps: RouteDeps, rel: string): Response {
  const clean = rel.replace(/^\/+/, '');
  const dir = clean.split('/')[0] ?? '';
  if (!clean || clean.includes('..') || !VENDOR_DIRS.has(dir)) {
    throw new AppError('E_ASSET_MISSING', `解码器路径不在白名单：${clean}`);
  }
  const path = join(deps.editorDir, 'vendor', clean);
  if (!isFile(path)) {
    return new Response(`decoder asset missing: ${clean}`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const ext = path.slice(path.lastIndexOf('.'));
  return new Response(createReadStream(path) as unknown as ReadableStream, {
    headers: {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

export function serveEditorAsset(deps: RouteDeps, rel: string): Response {
  const clean = rel.replace(/^\/+/, '');
  if (clean.includes('..')) throw new AppError('E_INVALID_PARAMS', '非法静态路径');
  const target = clean && isFile(join(deps.editorDir, clean)) ? clean : 'index.html';
  const path = join(deps.editorDir, target);
  const ext = path.slice(path.lastIndexOf('.'));
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  try {
    return new Response(createReadStream(path) as unknown as ReadableStream, {
      headers: {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': cacheControl,
        ...SANDBOX_FRAME_HEADERS,
      },
    });
  } catch {
    throw new AppError('E_ASSET_MISSING', `editor 静态文件不存在：${clean}`);
  }
}
