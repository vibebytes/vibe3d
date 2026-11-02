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
        if (cli.command === 'scene import' && field === 'doc') continue;
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
    const usage = usageOf('scene.import');
    expect(usage.startsWith('scene import <roomId> <file>')).toBe(true);
    expect(usage).not.toContain('--doc');
  });

  it('有 cli.defaults 或 flatten 的字段在 usage 中加方括号', () => {
    expect(usageOf('node.create')).toContain('[--kind <mesh|group|light>]');
    expect(usageOf('fx.create')).toContain('[--type <particles|shaft>]');
    expect(usageOf('stage.set')).toContain('[--stage <json|@file>]');
    expect(usageOf('material.patch')).toContain('[--patch <json|@file>]');
    expect(usageOf('animation.define')).toContain('[--clip-json <json|@file>]');
  });

  it('节点引用与标量联合显示为 <value> 或 <a,b>，而不是 <json|@file>', () => {
    expect(usageOf('render.views')).toContain('[--node <a,b>]');
    expect(usageOf('editor.open')).toContain('[--focus <value>]');
    expect(usageOf('mesh.tube')).toContain('--radius <value>');
  });

  it('--size WxH 只出现在像素宽高能力上，不出现在 3D 米制宽高上', () => {
    expect(usageOf('render.snapshot')).toContain('[--size WxH]');
    expect(usageOf('decal.create')).not.toContain('--size');
    expect(usageOf('mesh.backdrop')).not.toContain('--size');
  });

  it('可选位置参数显示为 [roomId]', () => {
    expect(usageOf('job.list')).toBe('job ls [roomId]');
  });
});
