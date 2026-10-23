import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { AppError, PROTOCOL_VERSION, isRoomId } from '@vibebyte/vibe3d-protocol';
import { type WebSocket, WebSocketServer } from 'ws';
import type { DispatchContext } from '../context';
import { TOKEN_COOKIE, tokenMatches } from '../http/middleware';
import type { Logger } from '../logger';
import type { WsHub } from './hub';
import { decodeClientFrame, encodeFrame } from './protocol';

export interface WsDeps {
  server: Server;
  ctx: DispatchContext;
  token: string;
  hub: WsHub;
  logger: Logger;
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

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachWebSocket(deps: WsDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  deps.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = /^\/r\/([^/]+)\/ws$/.exec(url.pathname);
    if (!match) return reject(socket, 404, 'Not Found');

    const roomId = match[1] ?? '';
    const token = url.searchParams.get('t') ?? cookieToken(req.headers.cookie);
    if (!isRoomId(roomId)) return reject(socket, 400, 'Bad Request');
    if (!tokenMatches(deps.token, token)) return reject(socket, 401, 'Unauthorized');

    let room: ReturnType<DispatchContext['rooms']['get']>;
    try {
      room = deps.ctx.rooms.get(roomId);
    } catch (err) {
      if (err instanceof AppError) return reject(socket, err.http, 'Not Found');
      return reject(socket, 500, 'Internal Server Error');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = deps.hub.add(roomId, ws);
      ws.send(
        encodeFrame({
          type: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          roomId,
          revision: room.revision,
          editors: deps.hub.count(roomId),
        }),
      );
      deps.logger.debug({ event: 'ws.open', roomId });

      ws.on('message', (raw) => {
        const frame = decodeClientFrame(raw.toString());
        if (!frame) return;
        if (frame.type === 'ping') {
          ws.send(encodeFrame({ type: 'pong', t: frame.t ?? Date.now() }));
          return;
        }
        if (frame.type === 'snapshot.result') {
          deps.hub.resolveSnapshot(frame.requestId, frame.png, frame.error);
          return;
        }
        deps.onClientFrame?.(roomId, ws, frame);
      });

      ws.on('close', () => {
        deps.hub.remove(client);
        deps.logger.debug({ event: 'ws.close', roomId });
      });
      ws.on('error', (err) => deps.logger.warn({ event: 'ws.error', roomId, err: String(err) }));
    });
  });

  return wss;
}
