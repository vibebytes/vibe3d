import { Vibe3DError } from '@vibebyte/vibe3d-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server';
import type { ToolRuntime } from '../src/tools';

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
  it('daemon 死亡后 E_NETWORK 触发重置，下一次调用重新连接并成功', async () => {
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
    expect(lastReply().result.isError).toBe(true);
    expect(JSON.parse(lastReply().result.content[0].text).code).toBe('E_NETWORK');

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
