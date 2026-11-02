import { CAPABILITIES, CLI_COMMANDS, type CapabilityName } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args';
import { commandOf } from '../src/exec';
import { paramsFromFlags } from '../src/flags';

function realistic(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value === 'r1') return 'r_aaaaaaaa';
    if (/^n\d+$/.test(value) || value === '@runner') return 'n_aaaaaaaa';
    if (/^m\d+$/.test(value)) return 'm_aaaaaaaa';
    if (/^f\d+$/.test(value)) return 'f_aaaaaaaa';
    if (value === 's1' || value === 'abc') return 'a'.repeat(64);
    return value;
  }
  if (Array.isArray(value)) return value.map(realistic);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, realistic(item)]));
  }
  return value;
}

describe('cli examples', () => {
  it('每条 example 都能通过 input schema', () => {
    const failures: string[] = [];
    for (const row of CLI_COMMANDS) {
      if (row.local) continue;
      const hit = commandOf(parseArgs(row.example.split(' '))._);
      if (!hit) {
        failures.push(`${row.command}: 无法识别 ${row.example}`);
        continue;
      }
      try {
        const flags = parseArgs(row.example.split(' ')).flags;
        const resolved = paramsFromFlags(hit.capability, hit.positionals, flags);
        const parsed = CAPABILITIES[hit.capability as CapabilityName].input.safeParse(
          realistic(resolved.params),
        );
        if (!parsed.success)
          failures.push(`${row.command}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
      } catch (err) {
        failures.push(`${row.command}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
