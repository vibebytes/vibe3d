import type { RunRecord } from './discovery';

export interface ServerFrames {
  hello: { protocolVersion: string; roomId: string; revision: number; editors?: number };
  event: { event: string; data: Record<string, unknown> };
  overflow: { revision: number };
}

export interface EventHandlers {
  onHello?: (frame: ServerFrames['hello']) => void;
  onEvent?: (frame: ServerFrames['event']) => void;
  onOverflow?: (frame: ServerFrames['overflow']) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: Error) => void;
}

export interface Subscription {
  close: () => void;
  send: (frame: Record<string, unknown>) => void;
}

interface WsLike {
  on(event: string, listener: (...args: never[]) => void): void;
  once(event: string, listener: (...args: never[]) => void): void;
  close(): void;
  send(data: string): void;
}

type WsCtor = new (url: string) => WsLike;

export async function subscribeRoom(
  endpoint: Pick<RunRecord, 'host' | 'port' | 'token'>,
  roomId: string,
  handlers: EventHandlers = {},
): Promise<Subscription> {
  const mod = (await import('ws')) as unknown as { WebSocket?: WsCtor; default?: WsCtor };
  const Ctor = mod.WebSocket ?? mod.default;
  if (!Ctor) throw new Error('ws 模块不可用');
  const query = endpoint.token ? `?t=${encodeURIComponent(endpoint.token)}` : '';
  const url = `ws://${endpoint.host}:${endpoint.port}/r/${roomId}/ws${query}`;
  const socket = new Ctor(url);

  socket.on('message', ((raw: unknown) => {
    try {
      const frame = JSON.parse(String(raw)) as { type?: string } & Record<string, unknown>;
      if (frame.type === 'hello') handlers.onHello?.(frame as unknown as ServerFrames['hello']);
      else if (frame.type === 'event') handlers.onEvent?.(frame as unknown as ServerFrames['event']);
      else if (frame.type === 'overflow') handlers.onOverflow?.(frame as unknown as ServerFrames['overflow']);
    } catch (err) {
      handlers.onError?.(err as Error);
    }
  }) as (...args: never[]) => void);

  socket.on('close', ((code: number, reason: unknown) => handlers.onClose?.(code, String(reason))) as (
    ...args: never[]
  ) => void);
  socket.on('error', ((err: Error) => handlers.onError?.(err)) as (...args: never[]) => void);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', (() => resolve()) as (...args: never[]) => void);
    socket.once('error', ((err: Error) => reject(err)) as (...args: never[]) => void);
  });

  return {
    close: () => socket.close(),
    send: (frame) => socket.send(JSON.stringify(frame)),
  };
}
