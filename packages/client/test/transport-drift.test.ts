import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Vibe3DError } from '../src/errors';
import { RpcClient } from '../src/transport';

const OLD_CAPS = ['hello', 'room.list', 'scene.get'];

function fakeDaemon(capabilities: string[]): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = JSON.parse(raw) as { id: number; method: string };
      res.setHeader('content-type', 'application/json');
      if (body.method === 'hello') {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '0.1',
              daemonVersion: '0.0.9',
              renderer: 'none',
              capabilities,
            },
          }),
        );
        return;
      }
      if (!capabilities.includes(body.method)) {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `数据面不接受方法：${body.method}`,
              data: { code: 'E_NO_METHOD', message: `数据面不接受方法：${body.method}` },
            },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { rooms: [] } }));
    });
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      done({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

const live: Server[] = [];

afterEach(() => {
  for (const server of live.splice(0)) server.close();
});

describe('旧 daemon 的能力漂移', () => {
  it('当前能力在旧 daemon 里不存在时直接报 E_DAEMON_OUTDATED，而不是「数据面不接受方法」', async () => {
    const { server, url } = await fakeDaemon(OLD_CAPS);
    live.push(server);
    const client = new RpcClient({ url, token: 't' });
    const err = await client
      .call('room.use', { roomId: 'r_0000000a' }, { roomId: 'r_0000000a' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Vibe3DError);
    expect((err as Vibe3DError).code).toBe('E_DAEMON_OUTDATED');
    expect((err as Vibe3DError).message).toContain('room.use');
    expect((err as Vibe3DError).message).toContain('重启');
  });

  it('旧 daemon 也认识的方法照常调用', async () => {
    const { server, url } = await fakeDaemon(OLD_CAPS);
    live.push(server);
    const client = new RpcClient({ url, token: 't' });
    const out = await client.call<{ rooms: unknown[] }>('room.list');
    expect(out.rooms).toEqual([]);
  });

  it('别名等非能力名的方法交给 daemon 判定，不做本地门禁', async () => {
    const { server, url } = await fakeDaemon(OLD_CAPS);
    live.push(server);
    const client = new RpcClient({ url, token: 't' });
    const err = await client.call('scene.apply', {}, { roomId: 'r_0000000a' }).catch((e: unknown) => e);
    expect((err as Vibe3DError).code).toBe('E_NO_METHOD');
  });

  it('hello 自身失败后不缓存失败结果', async () => {
    let hellos = 0;
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const body = JSON.parse(raw) as { id: number; method: string };
        res.setHeader('content-type', 'application/json');
        if (body.method === 'hello') {
          hellos += 1;
          if (hellos === 1) {
            res.statusCode = 500;
            res.end('boom');
            return;
          }
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '0.1', daemonVersion: '0.0.9', renderer: 'none', capabilities: OLD_CAPS },
            }),
          );
          return;
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { rooms: [] } }));
      });
    });
    live.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
    const { port } = server.address() as AddressInfo;
    const client = new RpcClient({ url: `http://127.0.0.1:${port}`, token: 't' });
    await expect(client.call('room.list')).rejects.toBeInstanceOf(Vibe3DError);
    await expect(client.call('room.list')).resolves.toEqual({ rooms: [] });
  });
});
