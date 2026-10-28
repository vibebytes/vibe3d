import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { AppError, PROTOCOL_VERSION, isRoomId } from '@vibebyte/vibe3d-protocol';
import { parseShotMeta } from '@vibebyte/vibe3d-scene';
import { type WebSocket, WebSocketServer } from 'ws';
import type { DispatchContext } from '../context';
import { TOKEN_COOKIE, tokenMatches } from '../http/middleware';
import type { Logger } from '../logger';
import type { WsHub } from './hub';
import { decodeClientFrame, encodeFrame } from './protocol';

export interface WsDeps {
  server: Server;
  ctx: DispatchContext;
  token: string | undefined;
  hub: WsHub;
  logger: Logger;
  maxPayloadBytes?: number;
  onClientFrame?: (roomId: string, socket: WebSocket, frame: unknown) => void;
}

function cookieToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === TOKEN_COOKIE) return rest.join('=');
  }
  return undefined;
}

function reject(
  socket: Duplex,
  status: number,
  reason: string,
  logger?: Logger,
  detail?: Record<string, unknown>,
): void {
  logger?.warn({ event: 'surface.ws.reject', status, reason, ...detail });
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\n\r\n`);
  socket.destroy();
}

export const DEFAULT_WS_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function readClientId(url: URL): string | undefined {
  const raw = url.searchParams.get('clientId') ?? '';
  return CLIENT_ID_PATTERN.test(raw) ? raw : undefined;
}

function readHeadless(url: URL): boolean {
  const raw = url.searchParams.get('headless');
  return raw === '1' || raw === 'true';
}

function isPayloadOverflow(err: unknown): boolean {
  return err instanceof RangeError && /max payload/i.test(err.message);
}

export function attachWebSocket(deps: WsDeps): WebSocketServer {
  const maxPayload = deps.maxPayloadBytes ?? DEFAULT_WS_MAX_PAYLOAD_BYTES;
  const wss = new WebSocketServer({ noServer: true, maxPayload });

  deps.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = /^\/r\/([^/]+)\/ws$/.exec(url.pathname);
    if (!match) return reject(socket, 404, 'Not Found', deps.logger, { path: url.pathname });

    const roomId = match[1] ?? '';
    const token = url.searchParams.get('t') ?? cookieToken(req.headers.cookie);
    if (!isRoomId(roomId)) return reject(socket, 400, 'Bad Request', deps.logger, { roomId });
    if (!tokenMatches(deps.token, token)) {
      return reject(socket, 401, 'Unauthorized', deps.logger, {
        roomId,
        hasQueryToken: Boolean(url.searchParams.get('t')),
        hasCookie: Boolean(cookieToken(req.headers.cookie)),
      });
    }

    let room: ReturnType<DispatchContext['rooms']['get']>;
    try {
      room = deps.ctx.rooms.get(roomId);
    } catch (err) {
      if (err instanceof AppError) return reject(socket, err.http, 'Not Found', deps.logger, { roomId });
      return reject(socket, 500, 'Internal Server Error', deps.logger, { roomId, err: String(err) });
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = deps.hub.add(roomId, ws, {
        clientId: readClientId(url),
        headless: readHeadless(url),
      });
      ws.send(
        encodeFrame({
          type: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          roomId,
          revision: room.revision,
          editors: deps.hub.count(roomId),
        }),
      );
      deps.logger.info({
        event: 'surface.ws.open',
        roomId,
        clientId: client.clientId,
        headless: client.headless,
        editors: deps.hub.count(roomId),
      });
      deps.logger.info({
        event: 'surface.ready',
        roomId,
        clientId: client.clientId,
        headless: client.headless,
        editors: deps.hub.count(roomId),
        revision: room.revision,
      });

      ws.on('message', (raw) => {
        deps.hub.touch(client);
        const frame = decodeClientFrame(raw.toString());
        if (!frame) return;
        if (frame.type === 'pong') return;
        if (frame.type === 'ping') {
          ws.send(encodeFrame({ type: 'pong', t: frame.t ?? Date.now() }));
          return;
        }
        if (frame.type === 'snapshot.result') {
          if (frame.uploaded) return;
          deps.hub.resolveSnapshot(
            frame.requestId,
            {
              base64: frame.png,
              mime: frame.mime,
              width: frame.width,
              height: frame.height,
              meta: parseShotMeta(frame.meta) ?? undefined,
            },
            frame.error,
            frame.code,
          );
          return;
        }
        if (frame.type === 'idpass.result') {
          deps.hub.resolveIdPass(
            frame.requestId,
            { width: frame.width, height: frame.height, rgba: frame.rgba },
            frame.error,
          );
          return;
        }
        deps.onClientFrame?.(roomId, ws, frame);
      });

      ws.on('close', () => {
        deps.hub.remove(client);
        deps.logger.info({
          event: 'surface.ws.close',
          roomId,
          clientId: client.clientId,
          editors: deps.hub.count(roomId),
        });
      });
      ws.on('error', (err) =>
        deps.logger.warn({
          event: 'surface.ws.error',
          roomId,
          code: isPayloadOverflow(err) ? 'E_WS_PAYLOAD' : 'E_WS_SOCKET',
          limit: maxPayload,
          err: String(err),
        }),
      );
    });
  });

  return wss;
}
