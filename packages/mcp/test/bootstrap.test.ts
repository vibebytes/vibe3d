import { describe, expect, it, vi } from 'vitest';
import { createMemoRuntime, prewarm } from '../src/bootstrap';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runtime memo', () => {
  it('并发调用只连接一次', async () => {
    const factory = vi.fn(async () => 'studio');
    const get = createMemoRuntime(factory);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe('studio');
    expect(b).toBe('studio');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('连接失败后下一次调用可重试', async () => {
    const factory = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('E_NO_DAEMON'))
      .mockResolvedValueOnce('studio');
    const get = createMemoRuntime(factory);
    await expect(get()).rejects.toThrow('E_NO_DAEMON');
    await expect(get()).resolves.toBe('studio');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('预热', () => {
  it('立即触发连接，不等首个 tools/call', async () => {
    const factory = vi.fn(async () => 'studio');
    const get = createMemoRuntime(factory);
    prewarm(get);
    await tick();
    expect(factory).toHaveBeenCalledTimes(1);
    await get();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('预热失败不产生未处理拒绝，后续仍可重试', async () => {
    const factory = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('boot'))
      .mockResolvedValueOnce('studio');
    const get = createMemoRuntime(factory);
    const onError = vi.fn();
    prewarm(get, onError);
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(get()).resolves.toBe('studio');
  });
});
