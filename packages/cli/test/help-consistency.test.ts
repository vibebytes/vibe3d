import { CLI_COMMANDS, type CapabilityName, describeCapability } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { helpText } from '../src/help';

describe('help consistency', () => {
  it('CLI 详细帮助中的参数说明逐字等于 describeCapability', () => {
    const missing: string[] = [];
    for (const row of CLI_COMMANDS) {
      const text = helpText(row.command.split(' '));
      for (const param of describeCapability(row.capability as CapabilityName).params) {
        if (param.description && !text.includes(param.description)) {
          missing.push(`${row.command} ${param.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
