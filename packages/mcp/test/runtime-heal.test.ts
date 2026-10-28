import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server';
import { ToolRuntime } from '../src/tools';

const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
afterEach(() => write.mockClear());

const fakeRuntime = (call: (name: string) => Promise<unknown>): ToolRuntime =>
  ({ call }) as unknown as ToolRuntime;

type Server = ReturnType<typeof createServer>;

const callStatus = (server: Server, id: number) =>
  server.handle({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'vibe3d_status', arguments: {} },
  });

const lastReply = () => JSON.parse(String(write.mock.calls.at(-1)?.[0]));

describe('连接类错误自愈', () => {
  it('daemon 死亡后 E_NETWORK 触发重置，同一调用内重试即成功', async () => {
    const built = vi.fn();
    let current: ToolRuntime | undefined;
    const server = createServer({
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

    await callStatus(server, 1);
    expect(built).toHaveBeenCalledTimes(2);
    expect(lastReply().result.isError).toBeUndefined();
    expect(lastReply().result.content[0].text).toBe('ok');

    await callStatus(server, 2);
    expect(built).toHaveBeenCalledTimes(2);
    expect(lastReply().result.isError).toBeUndefined();
    expect(lastReply().result.content[0].text).toBe('ok');
  });

  it('域错误（E_INVALID_PARAMS）不重置 memo', async () => {
    const built = vi.fn();
    let current: ToolRuntime | undefined;
    const server = createServer({
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

    await callStatus(server, 1);
    await callStatus(server, 2);
    expect(built).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lastReply().result.content[0].text).code).toBe('E_INVALID_PARAMS');
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

  it('连接错误 → 重置 → 重建 runtime → 重放同一调用并成功', async () => {
    const { server, built } = buildCountingServer(['net', 'ok']);
    await callStatus(server, 1);
    expect(built).toHaveBeenCalledTimes(2);
    expect(lastReply().result.isError).toBeUndefined();
    expect(lastReply().result.content[0].text).toBe('ok');
  });

  it('重试一次仍连接错误 → 返回错误,不触发第三次重建', async () => {
    const { server, built } = buildCountingServer(['net', 'net']);
    await callStatus(server, 1);
    expect(built).toHaveBeenCalledTimes(2);
    const reply = lastReply();
    expect(reply.result.isError).toBe(true);
    expect(JSON.parse(reply.result.content[0].text).code).toBe('E_NETWORK');
  });

  it('域错误不重试、不重建', async () => {
    const { server, built } = buildCountingServer(['domain']);
    await callStatus(server, 1);
    expect(built).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lastReply().result.content[0].text).code).toBe('E_INVALID_PARAMS');
  });
});
