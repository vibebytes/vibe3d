import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDaemonEntry, startBudgetMs } from '../src/discovery';

describe('daemon 入口解析', () => {
  it('没有 node_modules link 时回退到同仓构建产物', () => {
    const entry = resolveDaemonEntry();
    expect(existsSync(entry.file)).toBe(true);
    expect(entry.file.endsWith('daemon/dist/index.js')).toBe(true);
  });
});

describe('启动等待预算', () => {
  it('空 home 用 15s 基线', () => {
    expect(startBudgetMs(0, {})).toBe(15_000);
  });

  it('房间越多预算越大，且封顶 45s', () => {
    expect(startBudgetMs(16, {})).toBeGreaterThan(15_000);
    expect(startBudgetMs(1000, {})).toBe(45_000);
  });

  it('VIBE3D_START_TIMEOUT_MS 可覆盖', () => {
    expect(startBudgetMs(16, { VIBE3D_START_TIMEOUT_MS: '90000' })).toBe(90_000);
    expect(startBudgetMs(16, { VIBE3D_START_TIMEOUT_MS: 'abc' })).toBe(23_000);
  });
});
