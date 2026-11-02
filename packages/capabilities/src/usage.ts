import { z } from 'zod';
import { cliFields, fieldAt, objectShape, positionalOf } from './cli-spec';
import { defOf, unwrap } from './coerce';
import type { CapabilityName } from './registry';
import { CAPABILITIES } from './registry';
import type { CliSpec } from './types';

function inputRequired(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return false;
    if (def.typeName === 'ZodEffects' && def.schema) {
      current = def.schema as z.ZodTypeAny;
      continue;
    }
    return true;
  }
  return true;
}

function booleanDefaultTrue(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodDefault') {
      const value = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
      return value === true;
    }
    const inner =
      def.typeName === 'ZodEffects'
        ? (def.schema as z.ZodTypeAny | undefined)
        : (def.innerType as z.ZodTypeAny | undefined);
    if (!inner) return false;
    current = inner;
  }
  return false;
}

function isObjectLike(schema: z.ZodTypeAny): boolean {
  const inner = unwrap(schema);
  if (
    inner instanceof z.ZodObject ||
    inner instanceof z.ZodRecord ||
    inner instanceof z.ZodUnknown ||
    inner instanceof z.ZodAny
  ) {
    return true;
  }
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    return (inner.options as z.ZodTypeAny[]).some((option) => isObjectLike(option));
  }
  return false;
}

function placeholder(schema: z.ZodTypeAny): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodEnum) return `<${inner.options.join('|')}>`;
  if (inner instanceof z.ZodTuple) {
    const count = inner.items.length;
    if (count === 2) return '<a,b>';
    if (count === 3) return '<x,y,z>';
    if (count === 4) return '<x,y,z,w>';
    return '<json>';
  }
  if (inner instanceof z.ZodArray) {
    return isObjectLike(inner.element) ? '<json|@file>' : '<a,b>';
  }
  if (isObjectLike(inner)) return '<json|@file>';
  return '<value>';
}

function flagText(flag: string, schema: z.ZodTypeAny, required: boolean, negate: boolean): string {
  if (negate || unwrap(schema) instanceof z.ZodBoolean) {
    if (booleanDefaultTrue(schema)) return `[--no-${flag}]`;
    return required ? `--${flag}` : `[--${flag}]`;
  }
  const body = `--${flag} ${placeholder(schema)}`;
  return required ? body : `[${body}]`;
}

/** 由 schema 和 cli 元数据生成一行用法。位置参数在前，必填 flag 不加方括号。 */
export function usageOf(name: CapabilityName): string {
  const spec = CAPABILITIES[name];
  const cli = spec.cli as CliSpec;
  if (!cli) throw new Error(`${name} 没有 cli`);
  const positional = positionalOf(spec);
  const shape = objectShape(spec.input) ?? {};
  const head = positional.map((field) => {
    const fieldSchema = fieldAt(spec.input, field);
    const optionalSole =
      positional.length === 1 &&
      Object.keys(shape).length === 1 &&
      fieldSchema !== undefined &&
      !inputRequired(fieldSchema);
    return optionalSole ? `[${field}]` : `<${field}>`;
  });
  if (cli.command === 'scene import') head.push('<file>');
  const shadowed = new Set(Object.values(cli.aliases ?? {}));
  const defaults = cli.defaults ?? {};
  const flattened = new Set(cli.flatten ?? []);
  const flags: { text: string; required: boolean }[] = [];
  for (const [flag, binding] of cliFields(spec)) {
    if (binding.via === 'field' && (positional.includes(binding.path) || shadowed.has(binding.path)))
      continue;
    if (cli.command === 'scene import' && binding.path === 'doc') continue;
    if (flag === 'size' && binding.via === 'sugar') {
      flags.push({ text: '[--size WxH]', required: false });
      continue;
    }
    const schema = fieldAt(spec.input, binding.path);
    if (!schema) throw new Error(`${cli.command}: 用法找不到字段 ${binding.path}`);
    const hasFallback = binding.path in defaults || flattened.has(binding.path);
    const required = binding.via === 'negate' || hasFallback ? false : inputRequired(schema);
    flags.push({
      text: flagText(flag, schema, required, binding.via === 'negate'),
      required,
    });
  }
  flags.sort((a, b) => Number(b.required) - Number(a.required));
  return [cli.command, ...head, ...flags.map((flag) => flag.text)].join(' ');
}
