import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDaemonEntry } from '../src/discovery';

describe('daemon 入口解析', () => {
  it('没有 node_modules link 时回退到同仓构建产物', () => {
    const entry = resolveDaemonEntry();
    expect(existsSync(entry.file)).toBe(true);
    expect(entry.file.endsWith('daemon/dist/index.js')).toBe(true);
  });
});
