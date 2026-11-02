import { z } from 'zod';
import { unwrap } from './coerce';
import { kebab } from './names';
import type { CapabilitySpec } from './types';

export const RESERVED_FLAGS = new Set([
  'home',
  'url',
  'token',
  'autostart',
  'pretty',
  'input',
  'out',
  'wait',
  'timeout',
  'help',
  'h',
]);

export interface FlagBinding {
  path: string;
  via: 'field' | 'alias' | 'negate' | 'flatten' | 'sugar';
}

export function objectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) return inner.shape;
  const options =
    inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion ? inner.options : undefined;
  if (!options) return undefined;
  const merged: Record<string, z.ZodTypeAny> = {};
  let any = false;
  for (const option of options) {
    const shape: Record<string, z.ZodTypeAny> | undefined = objectShape(option);
    if (!shape) continue;
    Object.assign(merged, shape);
    any = true;
  }
  return any ? merged : undefined;
}

export function fieldAt(schema: z.ZodTypeAny, path: string): z.ZodTypeAny | undefined {
  let current: z.ZodTypeAny | undefined = schema;
  for (const part of path.split('.')) {
    const shape: Record<string, z.ZodTypeAny> | undefined = current ? objectShape(current) : undefined;
    if (!shape || !(part in shape)) return undefined;
    current = shape[part];
  }
  return current;
}

function isBoolean(schema: z.ZodTypeAny): boolean {
  return unwrap(schema) instanceof z.ZodBoolean;
}

/** room 作用域自动把 roomId 放在位置参数最前面。 */
export function positionalOf(spec: CapabilitySpec): string[] {
  const declared = [...(spec.cli?.positional ?? [])];
  if (spec.scope === 'room' && fieldAt(spec.input, 'roomId') && !declared.includes('roomId')) {
    return ['roomId', ...declared];
  }
  return declared;
}

export function cliFields(spec: CapabilitySpec): Map<string, FlagBinding> {
  const command = spec.cli?.command ?? '(无命令)';
  const shape = objectShape(spec.input);
  if (!shape) throw new Error(`${command}: input 不是对象`);
  const map = new Map<string, FlagBinding>();
  const add = (flag: string, binding: FlagBinding) => {
    if (RESERVED_FLAGS.has(flag)) {
      throw new Error(`${command}: --${flag} 与保留参数冲突（${binding.path}）`);
    }
    const prev = map.get(flag);
    if (prev && prev.path !== binding.path) {
      throw new Error(`${command}: --${flag} 同时指向 ${prev.path} 与 ${binding.path}`);
    }
    map.set(flag, binding);
  };

  for (const [flag, path] of Object.entries(spec.cli?.aliases ?? {})) {
    add(flag, { path, via: 'alias' });
  }
  const aliasTargets = new Set(Object.values(spec.cli?.aliases ?? {}));
  for (const name of Object.keys(shape)) {
    if (spec.scope === 'room' && name === 'roomId') continue;
    const flag = kebab(name);
    const prev = map.get(flag);
    if (prev && prev.path !== name && aliasTargets.has(name)) continue;
    add(flag, { path: name, via: 'field' });
  }
  for (const [flag, path] of Object.entries(spec.cli?.negate ?? {})) {
    add(flag, { path, via: 'negate' });
  }
  for (const parent of spec.cli?.flatten ?? []) {
    const children = objectShape(fieldAt(spec.input, parent) ?? shape[parent]!);
    if (!children) throw new Error(`${command}: flatten ${parent} 不是对象`);
    for (const child of Object.keys(children)) {
      add(kebab(child), { path: `${parent}.${child}`, via: 'flatten' });
    }
  }
  if (shape.width && shape.height && !shape.size) add('size', { path: 'width', via: 'sugar' });
  if (shape.transform) {
    const sugar = [
      ['at', 'p'],
      ['rotation', 'r'],
      ['scale', 's'],
    ] as const;
    for (const [flag, leaf] of sugar) {
      if (!shape[flag]) add(flag, { path: `transform.${leaf}`, via: 'sugar' });
    }
  }
  return map;
}

export function cliProblems(name: string, spec: CapabilitySpec): string[] {
  const cli = spec.cli;
  if (!cli) return [];
  const problems: string[] = [];
  if (!cli.example?.trim()) problems.push(`${name}: 缺少 example`);
  for (const field of positionalOf(spec)) {
    if (!fieldAt(spec.input, field)) problems.push(`${name}: 位置参数 ${field} 不是字段`);
  }
  for (const [flag, path] of Object.entries(cli.aliases ?? {})) {
    if (!fieldAt(spec.input, path)) problems.push(`${name}: 别名 --${flag} 指向不存在的 ${path}`);
  }
  for (const parent of cli.flatten ?? []) {
    const field = fieldAt(spec.input, parent);
    if (!field || !objectShape(field)) problems.push(`${name}: flatten ${parent} 不是对象`);
  }
  for (const [flag, path] of Object.entries(cli.negate ?? {})) {
    const field = fieldAt(spec.input, path);
    if (!field) problems.push(`${name}: 取反 --${flag} 指向不存在的 ${path}`);
    else if (!isBoolean(field)) problems.push(`${name}: 取反 --${flag} 的 ${path} 不是布尔`);
  }
  for (const path of Object.keys(cli.values ?? {})) {
    if (!fieldAt(spec.input, path)) problems.push(`${name}: 字面量映射 ${path} 不是字段`);
  }
  for (const [path, value] of Object.entries(cli.defaults ?? {})) {
    const field = fieldAt(spec.input, path);
    if (!field) problems.push(`${name}: 默认值 ${path} 不是字段`);
    else if (!field.safeParse(value).success) problems.push(`${name}: 默认值 ${path} 无法通过字段校验`);
  }
  try {
    cliFields(spec);
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  return problems;
}
