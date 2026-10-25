import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Vibe3DError } from '../src/errors';
import { RpcClient } from '../src/transport';

function daemonReplying(status: number, payload: unknown): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    req.on('data', () => undefined);
    req.on('end', () => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
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

describe('daemon 错误明细透传', () => {
  it('把 error.data 里的业务字段交给调用方，而不是丢掉', async () => {
    const { server, url } = await daemonReplying(409, {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32002,
        message: 'revision 冲突：7 != 8',
        data: {
          code: 'E_CONFLICT',
          retryable: true,
          baseRevision: 8,
          hint: '用最新 revision 作 baseRevision',
          changedPaths: ['nodes.n_0000000a.p'],
        },
      },
    });
    live.push(server);
    const client = new RpcClient({ url, token: 't' });
    const err = (await client
      .call('scene.apply', { ops: [] }, { roomId: 'r_0000000a' })
      .catch((e: unknown) => e)) as Vibe3DError;
    expect(err).toBeInstanceOf(Vibe3DError);
    expect(err.code).toBe('E_CONFLICT');
    expect(err.data).toMatchObject({
      baseRevision: 8,
      hint: '用最新 revision 作 baseRevision',
      changedPaths: ['nodes.n_0000000a.p'],
    });
    expect(err.data).not.toHaveProperty('code');
    expect(err.data).not.toHaveProperty('retryable');
  });

  it('能力类错误带上 next 指路', async () => {
    const { server, url } = await daemonReplying(503, {
      jsonrpc: '2.0',
      id: 2,
      error: {
        code: -32009,
        message: '当前渲染器 auto 不支持 id-pass',
        data: {
          code: 'E_RENDER_UNAVAILABLE',
          retryable: false,
          renderer: 'auto',
          hint: '先用 vibe3d_open_editor 打开房间',
          next: { tool: 'vibe3d_render_snapshot', params: { roomId: 'r_0000000a' } },
        },
      },
    });
    live.push(server);
    const client = new RpcClient({ url, token: 't' });
    const err = (await client
      .call('render.id-pass', {}, { roomId: 'r_0000000a' })
      .catch((e: unknown) => e)) as Vibe3DError;
    expect(err.data).toMatchObject({
      renderer: 'auto',
      next: { tool: 'vibe3d_render_snapshot' },
    });
  });
});
