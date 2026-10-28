import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server';
import { ToolRuntime } from '../src/tools';
import { connectClient } from './helpers/client';

const fakeRuntime = (call: (name: string) => Promise<unknown>): ToolRuntime =>
  ({ call }) as unknown as ToolRuntime;

const textOf = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((item) => item.type === 'text')?.text ?? '';

describe('连接类错误自愈', () => {
  it('daemon 死亡后 E_NETWORK 触发重置，同一调用内重试即成功', async () => {
    const built = vi.fn();
    let current: ToolRuntime | undefined;
    const { client } = await connectClient({
      runtime: async () => {
        current ??= (() => {
          built();
          return built.mock.calls.length === 1
            ? fakeRuntime(async () => {
                throw new Vibe3DError('E_NETWORK', 'daemon 连接失败');
              })
            : fakeRuntime(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
        })();
        return current;
      },
      onRuntimeError: () => {
        current = undefined;
      },
    });

    const first = await client.callTool({ name: 'vibe3d_status', arguments: {} });
    expect(built).toHaveBeenCalledTimes(2);
    expect(first.isError).toBeUndefined();
    expect(textOf(first)).toBe('ok');

    const second = await client.callTool({ name: 'vibe3d_status', arguments: {} });
    expect(built).toHaveBeenCalledTimes(2);
    expect(second.isError).toBeUndefined();
    expect(textOf(second)).toBe('ok');
  });

  it('域错误（E_INVALID_PARAMS）不重置 memo', async () => {
    const built = vi.fn();
    let current: ToolRuntime | undefined;
    const { client } = await connectClient({
      runtime: async () => {
        current ??= (() => {
          built();
          return fakeRuntime(async () => {
            throw new Vibe3DError('E_INVALID_PARAMS', '参数非法');
          });
        })();
        return current;
      },
      onRuntimeError: () => {
        current = undefined;
      },
    });

    await client.callTool({ name: 'vibe3d_status', arguments: {} });
    const second = await client.callTool({ name: 'vibe3d_status', arguments: {} });
    expect(built).toHaveBeenCalledTimes(1);
    expect(JSON.parse(textOf(second)).code).toBe('E_INVALID_PARAMS');
  });
});

describe('ToolRuntime 真实调用链', () => {
  const rejectClient = (code: Vibe3DError['code']) =>
    ({
      home: '/tmp/vibe3d-runtime-heal-test',
      client: {
        call: async () => {
          throw new Vibe3DError(code, `stub: ${code}`);
        },
      },
    }) as never;

  it('token 失配 E_UNAUTHORIZED 必须抛出（让 memo 重置），而不是吞成错误结果', async () => {
    const runtime = new ToolRuntime(rejectClient('E_UNAUTHORIZED'));
    await expect(runtime.call('vibe3d_status', {})).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
    });
  });

  it('E_NO_DAEMON 同样必须抛出', async () => {
    const runtime = new ToolRuntime(rejectClient('E_NO_DAEMON'));
    await expect(runtime.call('vibe3d_status', {})).rejects.toMatchObject({
      code: 'E_NO_DAEMON',
    });
  });

  it('域错误（E_INVALID_PARAMS）仍以 isError 结果返回', async () => {
    const runtime = new ToolRuntime(rejectClient('E_INVALID_PARAMS'));
    const result = await runtime.call('vibe3d_status', {});
    expect(result.isError).toBe(true);
    expect(JSON.parse(String((result.content?.[0] as { text?: string } | undefined)?.text)).code).toBe(
      'E_INVALID_PARAMS',
    );
  });
});

describe('同一次调用内的有界重试', () => {
  const buildCountingServer = (sequence: Array<'net' | 'domain' | 'ok'>) => {
    const built = vi.fn();
    let index = 0;
    const runtimeFor = (kind: 'net' | 'domain' | 'ok'): ToolRuntime =>
      kind === 'ok'
        ? fakeRuntime(async () => ({ content: [{ type: 'text', text: 'ok' }] }))
        : fakeRuntime(async () => {
            throw new Vibe3DError(kind === 'net' ? 'E_NETWORK' : 'E_INVALID_PARAMS', kind);
          });
    const server = createServer({
      runtime: async () => {
        built();
        const kind = sequence[Math.min(index, sequence.length - 1)]!;
        index += 1;
        return runtimeFor(kind);
      },
      onRuntimeError: () => undefined,
    });
    return { server, built };
  };

  const callStatus = async (server: ReturnType<typeof createServer>) => {
    const [clientTransport, serverTransport] = (
      await import('@modelcontextprotocol/server')
    ).InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const { Client } = await import('@modelcontextprotocol/client');
    const client = new Client({ name: 'vibe3d-test', version: '0.0.0' });
    await client.connect(clientTransport);
    return client.callTool({ name: 'vibe3d_status', arguments: {} });
  };

  it('连接错误 → 重置 → 重建 runtime → 重放同一调用并成功', async () => {
    const { server, built } = buildCountingServer(['net', 'ok']);
    const result = await callStatus(server);
    expect(built).toHaveBeenCalledTimes(2);
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe('ok');
  });

  it('重试一次仍连接错误 → 返回错误,不触发第三次重建', async () => {
    const { server, built } = buildCountingServer(['net', 'net']);
    const result = await callStatus(server);
    expect(built).toHaveBeenCalledTimes(2);
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).code).toBe('E_NETWORK');
  });

  it('域错误不重试、不重建', async () => {
    const { server, built } = buildCountingServer(['domain']);
    const result = await callStatus(server);
    expect(built).toHaveBeenCalledTimes(1);
    expect(JSON.parse(textOf(result)).code).toBe('E_INVALID_PARAMS');
  });
});
