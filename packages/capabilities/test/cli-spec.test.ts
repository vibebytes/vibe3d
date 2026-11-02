import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cliFields, cliProblems, positionalOf } from '../src/cli-spec';
import { CAPABILITIES } from '../src/registry';
import type { CapabilitySpec } from '../src/types';

const withCli = Object.entries(CAPABILITIES).filter((entry) => entry[1].cli) as [string, CapabilitySpec][];

/** args 里不跟在 flag 后面的 `<字段>` 才是位置参数。roomId 由作用域自动补上，不计入。 */
function extraPlaceholders(spec: CapabilitySpec): string[] {
  const tokens = (spec.cli?.args ?? '').split(/\s+/).filter(Boolean);
  const names: string[] = [];
  let valueFollows = false;
  for (const token of tokens) {
    if (token.includes('--')) {
      valueFollows = !token.includes('=');
      continue;
    }
    if (valueFollows) {
      valueFollows = false;
      continue;
    }
    const match = /^<?([A-Za-z][\w-]*)>/.exec(token);
    if (match?.[1] && match[1] !== 'roomId') names.push(match[1]);
  }
  return names;
}

describe('cli spec', () => {
  it('每个 CLI 命令都声明了 example', () => {
    const missing = withCli.filter(([, spec]) => !spec.cli?.example?.trim()).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('每个 CLI 命令的位置参数都是真实字段', () => {
    const problems: string[] = [];
    for (const [name, spec] of withCli) {
      problems.push(...cliProblems(name, spec).filter((item) => item.includes('位置参数')));
      const declared = positionalOf(spec).filter((field) => !(spec.scope === 'room' && field === 'roomId'));
      const placeholders = extraPlaceholders(spec);
      if (placeholders.length > declared.length) {
        problems.push(
          `${name}: 位置参数 ${declared.join(',') || '(无)'}，args 占位 ${placeholders.join(',') || '(无)'}`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('别名、平铺、取反、字面量、默认值的目标都存在', () => {
    const problems = withCli.flatMap(([name, spec]) =>
      cliProblems(name, spec).filter((item) => /别名|flatten|取反|字面量|默认值/.test(item)),
    );
    expect(problems).toEqual([]);
  });

  it('flag 不与保留 flag 冲突，且不存在歧义', () => {
    const problems = withCli.flatMap(([name, spec]) =>
      cliProblems(name, spec).filter((item) => /保留参数|同时指向/.test(item)),
    );
    expect(problems).toEqual([]);
  });

  it('cliFields 拒绝歧义 flag', () => {
    const spec: CapabilitySpec = {
      title: 'fixture',
      input: z.object({ roomId: z.string(), materialId: z.string() }),
      output: z.object({}),
      scope: 'room',
      mutating: false,
      wire: 'room.get',
      cli: { command: 'fixture', example: 'fixture r1', aliases: { 'material-id': 'missing' } },
    };
    expect(() => cliFields(spec)).toThrow(/同时指向|不存在|missing/);
  });

  it('命令与同义命令全局唯一', () => {
    const seen = new Map<string, string>();
    for (const [name, spec] of withCli) {
      for (const command of [spec.cli?.command, ...(spec.cli?.synonyms ?? [])]) {
        if (!command) continue;
        expect(seen.has(command), `${command} 同时属于 ${seen.get(command)} 和 ${name}`).toBe(false);
        seen.set(command, name);
      }
    }
  });

  it('camera.project 与 camera.unproject 有 CLI 命令', () => {
    expect(CAPABILITIES['camera.project'].cli?.command).toBe('camera project');
    expect(CAPABILITIES['camera.unproject'].cli?.command).toBe('camera unproject');
  });
});
