import { describe, expect, it } from 'vitest';
import { CLI_COMMANDS } from '../../capabilities/generated/cli';
import { positionalOf } from '../../capabilities/src/cli-spec';
import { CAPABILITIES } from '../../capabilities/src/registry';
import { parseArgs } from '../src/args';
import { run } from '../src/commands';
import { recording } from './support/recording';

/** 这些命令不发出自己的 capability 调用，覆盖棘轮不计它们。 */
const LOCAL = new Set(['status']);

const KNOWN_MISSING = new Set<string>([]);

function argvOf(command: string, capability: keyof typeof CAPABILITIES): string[] {
  const spec = CAPABILITIES[capability];
  const fields = positionalOf(spec).filter((field) => !(spec.scope === 'room' && field === 'roomId'));
  const values = spec.scope === 'room' ? ['r1', ...fields.map(() => 'x')] : fields.map(() => 'x');
  return [...command.split(' '), ...values];
}

describe('cli command coverage', () => {
  it('每条 CLI_COMMANDS 都能发出对应能力调用（缺失清单只能缩小）', async () => {
    const missing: string[] = [];
    for (const row of CLI_COMMANDS) {
      if (LOCAL.has(row.command)) continue;
      const rec = recording();
      let threw = false;
      let unknown = false;
      try {
        await run(parseArgs(argvOf(row.command, row.capability)), rec.connect);
      } catch (err) {
        threw = true;
        unknown = err instanceof Error && err.message.includes('未知命令');
      }
      const called = rec.calls.some((call) => call.method === row.capability);
      // 校验错误说明命令已经路由到处理器；只有「未知命令」或静默返回才算缺失。
      if (!called && (!threw || unknown)) missing.push(row.command);
    }
    expect(new Set(missing)).toEqual(KNOWN_MISSING);
  });
});
