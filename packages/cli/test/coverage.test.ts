import { describe, expect, it } from 'vitest';
import { CLI_COMMANDS } from '../../capabilities/generated/cli';
import { parseArgs } from '../src/args';
import { run } from '../src/commands';
import { recording } from './support/recording';

const KNOWN_MISSING = new Set<string>([]);

describe('cli command coverage', () => {
  it('每条 CLI_COMMANDS 都能发出对应能力调用（缺失清单只能缩小）', async () => {
    const missing: string[] = [];
    for (const row of CLI_COMMANDS) {
      if (row.local) continue;
      const rec = recording({
        [row.capability]: row.job ? { jobId: 'j1' } : {},
      });
      try {
        await run(parseArgs(row.example.split(' ')), rec.connect);
      } catch {
        // 忽略后续输出阶段的错误，下面只看是否发出了能力调用
      }
      if (!rec.calls.some((call) => call.method === row.capability)) missing.push(row.command);
    }
    expect(new Set(missing)).toEqual(KNOWN_MISSING);
  });
});
