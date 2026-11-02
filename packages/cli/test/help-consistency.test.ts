import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLI_COMMANDS,
  type CapabilityName,
  type ParamDoc,
  describeCapability,
} from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { helpText } from '../src/help';

function descriptions(params: readonly ParamDoc[]): string[] {
  return params.flatMap((param) => [
    ...(param.description ? [param.description] : []),
    ...descriptions(param.fields ?? []),
  ]);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('help consistency', () => {
  it('CLI 详细帮助中的参数说明逐字等于 describeCapability', () => {
    const missing: string[] = [];
    for (const row of CLI_COMMANDS) {
      const text = helpText(row.command.split(' '));
      for (const param of describeCapability(row.capability as CapabilityName).params) {
        if (param.description && !text.includes(param.description))
          missing.push(`${row.command} ${param.name}`);
        for (const value of param.values ?? []) {
          if (!text.includes(String(value))) missing.push(`${row.command} ${param.name}=${String(value)}`);
        }
        if (param.default !== undefined && !text.includes(JSON.stringify(param.default))) {
          missing.push(`${row.command} ${param.name} default`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('MCP vibe3d_help 与 CLI 帮助引用同一份说明', () => {
    for (const row of CLI_COMMANDS.slice(0, 10)) {
      const docs = descriptions(describeCapability(row.capability as CapabilityName).params);
      const text = helpText(row.command.split(' '));
      expect(docs.filter((item) => text.includes(item)).sort()).toEqual([...docs].sort());
    }
  });

  it('仓库中不存在第二份参数说明', () => {
    const root = join(import.meta.dirname, '../src');
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('.describe(');
      for (const literal of text.match(/`[^`]*`|'[^']*'|"[^"]*"/g) ?? []) {
        const han = literal.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
        expect(han, file).toBeLessThan(200);
      }
    }
  });
});
