import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldAt } from '../src/cli-spec';
import { unwrap } from '../src/coerce';
import { kebab } from '../src/names';
import { CAPABILITIES, type CapabilityName } from '../src/registry';
import type { CliSpec } from '../src/types';
import { usageOf } from '../src/usage';

describe('cli usage', () => {
  it('usage 覆盖 input 的每个顶层字段', () => {
    const missing: string[] = [];
    for (const [name, spec] of Object.entries(CAPABILITIES)) {
      if (!spec.cli) continue;
      const usage = usageOf(name as CapabilityName);
      const cli = spec.cli as CliSpec;
      const positional = new Set(cli.positional ?? []);
      if (spec.scope === 'room') positional.add('roomId');
      const shadowed = new Set(Object.values(cli.aliases ?? {}));
      const shape = (spec.input as z.ZodObject<z.ZodRawShape>).shape;
      for (const field of Object.keys(shape)) {
        if (positional.has(field) || shadowed.has(field)) continue;
        if (!usage.includes(`--${kebab(field)}`)) missing.push(`${name}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('必填 flag 不加方括号，可选的加', () => {
    const usage = usageOf('animation.gait');
    expect(usage).toContain(' --style <walk|run|idle>');
    expect(usage).not.toContain('[--style');
  });

  it('枚举值来自 schema', () => {
    const usage = usageOf('render.snapshot');
    const match = /--shading <?([^>\]]+)>/.exec(usage);
    expect(match).toBeTruthy();
    const shown = new Set(match?.[1]?.split('|'));
    const schema = unwrap(fieldAt(CAPABILITIES['render.snapshot'].input, 'shading')!);
    expect(schema).toBeInstanceOf(z.ZodEnum);
    expect(shown).toEqual(new Set((schema as z.ZodEnum<[string, ...string[]]>).options));
  });

  it('scene import 使用位置参数 file', () => {
    expect(usageOf('scene.import').startsWith('scene import <roomId> <file>')).toBe(true);
  });
});
