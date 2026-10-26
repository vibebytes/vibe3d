import { describe, expect, it, vi } from 'vitest';
import { createMemoRuntime, prewarm } from '../src/bootstrap';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runtime memo', () => {
  it('并发调用只连接一次', async () => {
    const factory = vi.fn(async () => 'studio');
    const memo = createMemoRuntime(factory);
    const [a, b] = await Promise.all([memo.get(), memo.get()]);
    expect(a).toBe('studio');
    expect(b).toBe('studio');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('连接失败后下一次调用可重试', async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('E_NO_DAEMON'))
      .mockResolvedValueOnce('studio');
    const memo = createMemoRuntime(factory);
    await expect(memo.get()).rejects.toThrow('E_NO_DAEMON');
    await expect(memo.get()).resolves.toBe('studio');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('reset 后下一次调用重新连接', async () => {
    const factory = vi.fn(async () => ({ id: factory.mock.calls.length }));
    const memo = createMemoRuntime(factory);
    const first = await memo.get();
    memo.reset();
    const second = await memo.get();
    expect(second).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('预热', () => {
  it('立即触发连接，不等首个 tools/call', async () => {
    const factory = vi.fn(async () => 'studio');
    const memo = createMemoRuntime(factory);
    prewarm(memo.get);
    await tick();
    expect(factory).toHaveBeenCalledTimes(1);
    await memo.get();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('预热失败不产生未处理拒绝，后续仍可重试', async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boot'))
      .mockResolvedValueOnce('studio');
    const memo = createMemoRuntime(factory);
    const onError = vi.fn();
    prewarm(memo.get, onError);
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(memo.get()).resolves.toBe('studio');
  });
});
