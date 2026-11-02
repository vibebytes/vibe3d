import { readFileSync } from 'node:fs';
import {
  CAPABILITIES,
  type CapabilityName,
  type CliSpec,
  cliFields,
  coerceForSchema,
  defOf,
  fieldAt,
  normalized,
  objectShape,
  positionalOf,
} from '@vibebyte/vibe3d-capabilities';
import { Vibe3DError } from '@vibebyte/vibe3d-client';
import type { z } from 'zod';
import type { ParsedArgs } from './args';

export interface Resolved {
  capability: CapabilityName;
  params: Record<string, unknown>;
  roomId?: string;
}

const RESERVED = new Set([
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

function invalid(message: string): never {
  throw new Vibe3DError('E_INVALID_PARAMS', message);
}

function coerceField(
  schema: z.ZodTypeAny,
  value: unknown,
  path: string,
  readFile: (path: string) => string,
): unknown {
  try {
    return coerceForSchema(schema, value, { mode: 'cli', readFile, path });
  } catch (err) {
    invalid(err instanceof Error ? err.message : String(err));
  }
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j] ?? 0, row[j - 1] ?? 0) + 1;
      prev = row[j] ?? 0;
      row[j] = next;
    }
  }
  return row[b.length] ?? a.length;
}

function isRequired(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 6; i += 1) {
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

function setLeaf(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (const key of parts.slice(0, -1)) {
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts.at(-1) ?? path] = value;
}

function hasLeaf(target: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let cursor: unknown = target;
  for (const key of parts) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !(key in cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return true;
}

function resolveDotted(schema: z.ZodTypeAny, flag: string): string | undefined {
  let current = schema;
  const resolved: string[] = [];
  for (const part of flag.split('.')) {
    const shape = objectShape(current);
    if (!shape) return undefined;
    const key = Object.keys(shape).find((name) => normalized(name) === normalized(part));
    if (!key) return undefined;
    resolved.push(key);
    current = shape[key] ?? current;
  }
  return resolved.join('.');
}

function parseSize(text: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) invalid(`--size 需要 WxH，收到：${text}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** 把位置参数和 flag 变成能力入参。room 作用域的 roomId 同时留在 params 和 roomId 上。 */
export function paramsFromFlags(
  name: CapabilityName,
  positionals: string[],
  flags: ParsedArgs['flags'],
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Resolved {
  const spec = CAPABILITIES[name];
  const cli = spec.cli as CliSpec | undefined;
  if (!cli) invalid(`${name} 没有 CLI 命令`);
  const params: Record<string, unknown> = {};
  const input = flags.input;
  if (typeof input === 'string') {
    let text = input;
    if (input.startsWith('@')) {
      try {
        text = readFile(input.slice(1));
      } catch (err) {
        invalid(`--input 读取 ${input.slice(1)} 失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      invalid(`--input 必须是 JSON 对象：${err instanceof Error ? err.message : String(err)}`);
    }
    const base = coerceField(spec.input, raw, '--input', readFile);
    if (!base || typeof base !== 'object' || Array.isArray(base)) invalid('--input 必须是 JSON 对象');
    Object.assign(params, base);
  }
  const positional = positionalOf(spec);
  if (positionals.length > positional.length) {
    invalid(`${cli.command} 多了位置参数：${positionals.slice(positional.length).join(' ')}`);
  }
  const assigned = new Set<string>();
  const claim = (path: string, flag: string) => {
    if (assigned.has(path)) invalid(`字段 ${path} 被重复指定（--${flag}）`);
    assigned.add(path);
  };
  positional.forEach((field, index) => {
    const text = positionals[index];
    if (text === undefined) return;
    const schema = fieldAt(spec.input, field);
    if (!schema) invalid(`${cli.command} 的位置参数 ${field} 不是字段`);
    claim(field, field);
    setLeaf(params, field, coerceField(schema, text, field, readFile));
  });
  const bindings = cliFields(spec);
  const names = [...bindings.keys()];
  for (const [flag, raw] of Object.entries(flags)) {
    if (RESERVED.has(flag)) continue;
    const binding =
      bindings.get(flag) ??
      [...bindings.entries()].find(([key]) => normalized(key) === normalized(flag))?.[1];
    const dotted = !binding && flag.includes('.') ? resolveDotted(spec.input, flag) : undefined;
    if (!binding && !dotted) {
      const suggestion = names
        .map((candidate) => ({ candidate, score: distance(flag, candidate) }))
        .sort((a, b) => a.score - b.score)[0];
      const hint = suggestion && suggestion.score <= 2 ? `；是否想写 --${suggestion.candidate}？` : '';
      invalid(
        `未知参数 --${flag}（${cli.command} 可用：${names
          .slice(0, 8)
          .map((item) => `--${item}`)
          .join(' ')}${hint}）`,
      );
    }
    if (binding?.via === 'sugar' && normalized(flag) === 'size') {
      if (typeof raw !== 'string') invalid('--size 需要 WxH');
      claim('width', flag);
      claim('height', flag);
      const size = parseSize(raw);
      params.width = size.width;
      params.height = size.height;
      continue;
    }
    const path = binding?.path ?? dotted ?? flag;
    const schema = fieldAt(spec.input, path);
    if (!schema) invalid(`${cli.command} 没有字段 ${path}`);
    claim(path, flag);
    if (binding?.via === 'negate') {
      const on = raw === true || raw === 'true' || raw === '1';
      setLeaf(params, path, !on);
      continue;
    }
    const mapped = cli.values?.[path];
    if (typeof raw === 'string' && mapped && raw in mapped) {
      setLeaf(params, path, mapped[raw]);
      continue;
    }
    if (unwrapBoolean(schema)) {
      setLeaf(params, path, raw === true || raw === 'true' || raw === '1');
      continue;
    }
    if (raw === true) invalid(`--${flag} 需要一个值`);
    if (typeof raw !== 'string' && raw !== false) invalid(`--${flag} 的值无法识别`);
    const text = raw === false ? false : raw;
    setLeaf(params, path, coerceField(schema, text, `--${flag}`, readFile));
  }
  for (const root of new Set(
    [...assigned].filter((path) => path.includes('.')).map((path) => path.split('.')[0] ?? path),
  )) {
    const schema = fieldAt(spec.input, root);
    if (!schema || params[root] === undefined) continue;
    params[root] = coerceField(schema, params[root], root, readFile);
  }
  for (const [path, value] of Object.entries(cli.defaults ?? {})) {
    if (!hasLeaf(params, path)) setLeaf(params, path, value);
  }
  for (const field of positional) {
    const schema = fieldAt(spec.input, field);
    if (schema && isRequired(schema) && !hasLeaf(params, field)) {
      invalid(`${cli.command} 缺少位置参数 ${field}`);
    }
  }
  const roomId = spec.scope === 'room' && typeof params.roomId === 'string' ? params.roomId : undefined;
  return { capability: name, params, roomId };
}

function unwrapBoolean(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 6; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodBoolean') return true;
    const inner =
      def.typeName === 'ZodEffects'
        ? (def.schema as z.ZodTypeAny | undefined)
        : (def.innerType as z.ZodTypeAny | undefined);
    if (!inner) return false;
    current = inner;
  }
  return false;
}
