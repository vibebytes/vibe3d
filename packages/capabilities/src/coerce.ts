import { z } from 'zod';

type Def = { typeName?: string; [key: string]: unknown };
export const defOf = (schema: z.ZodTypeAny): Def => (schema as unknown as { _def: Def })._def;

const toCamel = (key: string): string => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function deepCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(value as Record<string, unknown>))
    out[toCamel(key)] = deepCamel(sub);
  return out;
}

export function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    const inner =
      def.typeName === 'ZodEffects'
        ? (def.schema as z.ZodTypeAny | undefined)
        : (def.innerType as z.ZodTypeAny | undefined);
    if (!inner) return current;
    current = inner;
  }
  return current;
}

const parseJsonish = (text: string): unknown => {
  const trimmed = text.trim();
  if (!/^[\[{]/.test(trimmed)) return undefined;
  try {
    return deepCamel(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
};

function arrayFromText(def: Def, text: string, depth: number, ctx: Ctx): unknown[] | undefined {
  const trimmed = text.trim();
  if (!/^[\[{]/.test(trimmed)) return undefined;
  let parsed: unknown;
  try {
    parsed = deepCamel(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
  let list: unknown[];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === 'object') {
    const nested = (parsed as Record<string, unknown>).ops;
    list = Array.isArray(nested) ? nested : [parsed];
  } else return undefined;
  if (def.typeName === 'ZodTuple') {
    const items = (def.items as z.ZodTypeAny[] | undefined) ?? [];
    const rest = def.rest as z.ZodTypeAny | null | undefined;
    return list.map((entry, index) => coerceValue(items[index] ?? rest ?? z.any(), entry, depth + 1, ctx));
  }
  const item = def.type as z.ZodTypeAny | undefined;
  return item ? list.map((entry) => coerceValue(item, entry, depth + 1, ctx)) : list;
}

const parseBoolean = (text: string): boolean | undefined => {
  const lower = text.trim().toLowerCase();
  if (lower === 'true' || lower === 'yes') return true;
  if (lower === 'false' || lower === 'no') return false;
  return undefined;
};

const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
};

const parseScalarText = (text: string): unknown => {
  const lower = text.trim().toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null' || lower === 'none') return null;
  return undefined;
};

const DEFAULTS: Record<string, unknown> = {
  transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
  p: [0, 0, 0],
  r: [0, 0, 0],
  s: [1, 1, 1],
  visible: true,
  parent: null,
  baseColor: [0.8, 0.8, 0.8, 1],
  metalness: 0,
  roughness: 0.5,
  emissive: [0, 0, 0],
  emissiveIntensity: 0,
  opacity: 1,
  doubleSided: false,
};

function fillRequired(
  inner: z.ZodObject<z.ZodRawShape>,
  out: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, field] of Object.entries(inner.shape)) {
    if (key in out) continue;
    if ((field as z.ZodTypeAny).isOptional?.()) continue;
    if (!(key in DEFAULTS)) continue;
    out[key] = structuredClone(DEFAULTS[key]);
  }
  return out;
}

const parseHexColour = (text: string): [number, number, number, number] | undefined => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
  if (!match) return undefined;
  const raw = match[1]!;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const channel = (index: number) =>
    Math.round((Number.parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255) * 1e6) / 1e6;
  return [channel(0), channel(1), channel(2), full.length === 8 ? channel(3) : 1];
};

export interface CoerceOptions {
  mode?: 'mcp' | 'cli';
  readFile?: (path: string) => string;
}

interface Ctx {
  mode: 'mcp' | 'cli';
  readFile?: (path: string) => string;
  path: string;
}

function fail(ctx: Ctx, message: string): never {
  throw new Error(`${ctx.path ? `${ctx.path}：` : ''}${message}`);
}

function isNullable(schema: z.ZodTypeAny): boolean {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodNull) return true;
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    return (inner.options as z.ZodTypeAny[]).some((option) => isNullable(option) || unwrap(option) instanceof z.ZodNull);
  }
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodNullable' || def.typeName === 'ZodNull') return true;
    const next =
      def.typeName === 'ZodEffects'
        ? (def.schema as z.ZodTypeAny | undefined)
        : def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault'
          ? (def.innerType as z.ZodTypeAny | undefined)
          : undefined;
    if (!next) return false;
    current = next;
  }
  return false;
}

function acceptsFile(schema: z.ZodTypeAny): boolean {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject || inner instanceof z.ZodRecord || inner instanceof z.ZodUnknown)
    return true;
  if (inner instanceof z.ZodArray) return acceptsFile((defOf(inner).type as z.ZodTypeAny | undefined) ?? z.string());
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    return (inner.options as z.ZodTypeAny[]).some((option) => acceptsFile(option));
  }
  return false;
}

function requiredNumberKeys(schema: z.ZodTypeAny): string[] | undefined {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    for (const option of inner.options as z.ZodTypeAny[]) {
      const keys = requiredNumberKeys(option);
      if (keys && keys.length > 0) return keys;
    }
    return undefined;
  }
  if (!(inner instanceof z.ZodObject)) return undefined;
  const keys: string[] = [];
  for (const [key, field] of Object.entries(inner.shape)) {
    const fieldSchema = field as z.ZodTypeAny;
    if (!(unwrap(fieldSchema) instanceof z.ZodNumber)) continue;
    const wrapped = defOf(fieldSchema).typeName;
    if (wrapped === 'ZodOptional' || wrapped === 'ZodDefault') continue;
    keys.push(key);
  }
  return keys;
}

function child(ctx: Ctx, path: string): Ctx {
  return { ...ctx, path };
}

/** CLI 文本：逗号 / 分号列表、按必填数字键填对象、@文件。不匹配时返回 undefined，个数不符则抛错。 */
function cliText(schema: z.ZodTypeAny, value: string, ctx: Ctx, depth: number): unknown | undefined {
  if (/^[\[{]/.test(value.trim())) return undefined;
  if (value.startsWith('@') && ctx.readFile && acceptsFile(schema)) {
    let text: string;
    try {
      text = ctx.readFile(value.slice(1));
    } catch (err) {
      fail(ctx, `读取 ${value.slice(1)} 失败：${err instanceof Error ? err.message : String(err)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      fail(ctx, `${value} 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
    }
    return coerceValue(schema, deepCamel(parsed), depth + 1, ctx);
  }
  const inner = unwrap(schema);
  const def = defOf(inner);
  if (def.typeName === 'ZodArray' || def.typeName === 'ZodTuple') {
    const itemSchema = def.type as z.ZodTypeAny | undefined;
    const itemInner = itemSchema ? unwrap(itemSchema) : undefined;
    const scalarItem =
      itemInner instanceof z.ZodString || itemInner instanceof z.ZodEnum || itemInner instanceof z.ZodNumber;
    if (def.typeName === 'ZodArray' && itemSchema && !scalarItem) {
      const groups = (value.includes(';') ? value.split(';') : [value])
        .map((part) => part.trim())
        .filter(Boolean);
      return groups.map((part, index) =>
        coerceValue(itemSchema, part, depth + 1, child(ctx, `${ctx.path}[${index}]`)),
      );
    }
    const groups = value.includes(';')
      ? value
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean)
      : undefined;
    if (groups && def.typeName === 'ZodArray' && def.type) {
      const item = def.type as z.ZodTypeAny;
      return groups.map((part, index) =>
        coerceValue(item, part, depth + 1, child(ctx, `${ctx.path}[${index}]`)),
      );
    }
    if (def.typeName === 'ZodTuple' && !value.includes(',')) return undefined;
    const parts = value.includes(',') ? value.split(',').map((part) => part.trim()) : [value];
    if (def.typeName === 'ZodTuple' && Array.isArray(def.items)) {
      const items = def.items as z.ZodTypeAny[];
      if (parts.length !== items.length) {
        fail(ctx, `需要 ${items.length} 个值，收到 ${parts.length} 个`);
      }
      return parts.map((part, index) =>
        coerceValue(items[index] ?? z.any(), part, depth + 1, child(ctx, `${ctx.path}[${index}]`)),
      );
    }
    if (def.typeName === 'ZodArray' && def.type) {
      const item = def.type as z.ZodTypeAny;
      return parts.map((part, index) =>
        coerceValue(item, part, depth + 1, child(ctx, `${ctx.path}[${index}]`)),
      );
    }
  }
  const keys = requiredNumberKeys(inner);
  if (keys && keys.length > 0 && /^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+$/.test(value.trim())) {
    const parts = value.split(',').map((part) => Number(part.trim()));
    if (parts.length !== keys.length) {
      fail(ctx, `需要 ${keys.length} 个数字（${keys.join(',')}），收到 ${parts.length} 个`);
    }
    const out: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      out[key] = parts[index];
    });
    return coerceValue(inner, out, depth + 1, ctx);
  }
  return undefined;
}

function coerceValue(schema: z.ZodTypeAny, value: unknown, depth: number, ctx: Ctx): unknown {
  if (
    ctx.mode === 'cli' &&
    typeof value === 'string' &&
    isNullable(schema) &&
    /^(null|none)$/i.test(value.trim())
  ) {
    return null;
  }
  if (
    ctx.mode === 'cli' &&
    value === false &&
    isNullable(schema) &&
    !(unwrap(schema) instanceof z.ZodBoolean)
  ) {
    return null;
  }
  if (depth > 8) return value;
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    if (ctx.mode !== 'cli' || (value !== null && typeof value === 'object')) return value;
    return parsed.data;
  }
  const inner = unwrap(schema);
  const def = defOf(inner);
  if (typeof value === 'string' && ctx.mode === 'cli') {
    const fromCli = cliText(schema, value, ctx, depth);
    if (fromCli !== undefined) return fromCli;
  }

  if (
    typeof value === 'string' &&
    def.typeName === 'ZodTuple' &&
    Array.isArray(def.items) &&
    (def.items.length === 4 || def.items.length === 3)
  ) {
    const hex = parseHexColour(value);
    if (hex) {
      const candidate = def.items.length === 3 ? hex.slice(0, 3) : hex;
      if (inner.safeParse(candidate).success) return candidate;
    }
  }

  if (typeof value === 'string') {
    const scalar = parseScalarText(value);
    if (scalar !== undefined && (schema.safeParse(scalar).success || inner.safeParse(scalar).success))
      return scalar;
    if (def.typeName === 'ZodBoolean') {
      if (ctx.mode === 'cli' && (value === '1' || value === '0')) return value === '1';
      const bool = parseBoolean(value);
      if (bool !== undefined && inner.safeParse(bool).success) return bool;
    }
    if (def.typeName === 'ZodNumber') {
      const num = parseNumber(value);
      if (num !== undefined && inner.safeParse(num).success) return num;
      if (ctx.mode === 'cli') fail(ctx, `无法把 ${JSON.stringify(value)} 转成数字`);
    }
    if (def.typeName === 'ZodArray' || def.typeName === 'ZodTuple') {
      const fromText = arrayFromText(def, value, depth, ctx);
      if (fromText !== undefined) return coerceValue(inner, fromText, depth + 1, ctx);
    }
    const parsedJson = parseJsonish(value);
    if (parsedJson !== undefined) {
      const next = coerceValue(inner, parsedJson, depth + 1, ctx);
      if (ctx.mode === 'cli' || inner.safeParse(next).success) return next;
    }
  }

  if (Array.isArray(value) && def.typeName === 'ZodTuple' && Array.isArray(def.items)) {
    const items = def.items as z.ZodTypeAny[];
    const rest = def.rest as z.ZodTypeAny | null | undefined;
    const out = value.map((item, index) =>
      coerceValue(items[index] ?? rest ?? z.any(), item, depth + 1, ctx),
    );
    if (items.length === 4 && out.every((item) => typeof item === 'number')) {
      const full = out.length === 3 ? [...out, 1] : out;
      const byte = full.map((item) => (item > 1 ? Math.round((item / 255) * 1e6) / 1e6 : item));
      if (byte.some((item, index) => item !== full[index]) && inner.safeParse(byte).success) return byte;
      return full;
    }
    if (items.length === 3 && out.length === 4 && out.every((item) => typeof item === 'number')) {
      const rgb = out.slice(0, 3);
      const byte = rgb.map((item) => (item > 1 ? Math.round((item / 255) * 1e6) / 1e6 : item));
      if (byte.some((item, index) => item !== rgb[index]) && inner.safeParse(byte).success) return byte;
      if (inner.safeParse(rgb).success) return rgb;
    }
    return out;
  }

  if (Array.isArray(value) && def.typeName === 'ZodArray' && def.type) {
    const items = value.map((item) => coerceValue(def.type as z.ZodTypeAny, item, depth + 1, ctx));
    return items;
  }

  if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
    const raw = def.options as unknown;
    const options = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
    let best: unknown;
    let bestIssues = Number.POSITIVE_INFINITY;
    for (const option of options as z.ZodTypeAny[]) {
      const next = coerceValue(option, value, depth + 1, ctx);
      const parsed = option.safeParse(next);
      if (parsed.success) return next;
      const issues = parsed.error.issues.length;
      if (issues < bestIssues) {
        bestIssues = issues;
        best = next;
      }
    }
    if (best !== undefined) return best;
  }

  if (def.typeName === 'ZodRecord' && def.valueType && value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(value as Record<string, unknown>))
      out[key] = coerceValue(
        def.valueType as z.ZodTypeAny,
        sub,
        depth + 1,
        child(ctx, ctx.path ? `${ctx.path}.${key}` : key),
      );
    return out;
  }

  if (def.typeName === 'ZodObject' && value && typeof value === 'object' && !Array.isArray(value)) {
    const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
      const field = shape[key];
      out[key] = field
        ? coerceValue(field, sub, depth + 1, child(ctx, ctx.path ? `${ctx.path}.${key}` : key))
        : sub;
    }
    return fillRequired(inner as z.ZodObject<z.ZodRawShape>, out);
  }

  return value;
}

export function coerceForSchema<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  opts: CoerceOptions = {},
): unknown {
  return coerceValue(schema, value, 0, { mode: opts.mode ?? 'mcp', readFile: opts.readFile, path: '' });
}

const asPlainRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function lenientRecord(value: unknown): Record<string, unknown> | undefined {
  const record =
    typeof value === 'string' ? asPlainRecord(parseJsonish(value)) : asPlainRecord(deepCamel(value));
  if (!record) return undefined;
  const siblings = Object.keys(record).filter((key) => key !== 'params' && key !== 'op');
  return siblings.length === 0 ? (asPlainRecord(record.params) ?? record) : record;
}
