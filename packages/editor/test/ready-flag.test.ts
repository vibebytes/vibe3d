import { describe, expect, it, vi } from 'vitest';
import { scheduleReadyFlag } from '../src/viewport/ready-flag';

type Win = Parameters<typeof scheduleReadyFlag>[0];

const fakeWindow = (): Win => ({}) as Win;

describe('scheduleReadyFlag', () => {
  it('调用即置位，不等定时器 / requestAnimationFrame', () => {
    const raf = vi.fn((_cb: FrameRequestCallback) => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    const win = fakeWindow();
    const stop = scheduleReadyFlag(win);
    expect((win as unknown as { __vibe3dReady?: boolean }).__vibe3dReady).toBe(true);
    expect(raf).not.toHaveBeenCalled();
    stop();
    vi.unstubAllGlobals();
  });

  it('清理后撤掉 ready 标记', () => {
    const win = fakeWindow();
    const stop = scheduleReadyFlag(win);
    stop();
    expect((win as unknown as { __vibe3dReady?: boolean }).__vibe3dReady).toBeUndefined();
  });
});
