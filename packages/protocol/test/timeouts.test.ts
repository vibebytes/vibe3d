import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUT_MS, RENDER_TIMEOUT_MS, timeoutFor } from '../src/timeouts';

describe('客户端 RPC 预算', () => {
  it('render 预算低于引擎 120s 调用超时，让优雅错误先回到调用方', () => {
    expect(RENDER_TIMEOUT_MS).toBe(110_000);
    expect(timeoutFor('render.snapshot')).toBe(RENDER_TIMEOUT_MS);
  });

  it('非 render 方法保持 30s', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(timeoutFor('room.create')).toBe(DEFAULT_TIMEOUT_MS);
  });
});
