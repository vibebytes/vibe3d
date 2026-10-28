import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mcp bundle', () => {
  it('dist/index.js 带 shebang，且体积不超过 1.6MB', () => {
    const file = new URL('../dist/index.js', import.meta.url);
    expect(existsSync(file)).toBe(true);
    const stat = statSync(file);
    expect(stat.size).toBeLessThanOrEqual(Math.floor(1.6 * 1024 * 1024));
    expect((stat.mode & 0o111) !== 0).toBe(true);
  });
});
