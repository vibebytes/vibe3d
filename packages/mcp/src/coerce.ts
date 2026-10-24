import { z } from 'zod';

type Def = { typeName?: string; [key: string]: unknown };
const defOf = (schema: z.ZodTypeAny): Def => (schema as unknown as { _def: Def })._def;

const toCamel = (key: string): string => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function deepCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(value as Record<string, unknown>))
    out[toCamel(key)] = deepCamel(sub);
  return out;
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
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

function arrayFromText(def: Def, text: string, depth: number): unknown[] | undefined {
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
  const item = def.type as z.ZodTypeAny | undefined;
  return item ? list.map((entry) => coerceValue(item, entry, depth + 1)) : list;
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

function coerceValue(schema: z.ZodTypeAny, value: unknown, depth: number): unknown {
  if (depth > 8 || schema.safeParse(value).success) return value;
  const inner = unwrap(schema);
  const def = defOf(inner);

  if (
    typeof value === 'string' &&
    def.typeName === 'ZodTuple' &&
    Array.isArray(def.items) &&
    def.items.length === 4
  ) {
    const hex = parseHexColour(value);
    if (hex && inner.safeParse(hex).success) return hex;
  }

  if (typeof value === 'string') {
    if (def.typeName === 'ZodBoolean') {
      const bool = parseBoolean(value);
      if (bool !== undefined && inner.safeParse(bool).success) return bool;
    }
    if (def.typeName === 'ZodNumber') {
      const num = parseNumber(value);
      if (num !== undefined && inner.safeParse(num).success) return num;
    }
    if (def.typeName === 'ZodArray') {
      const fromText = arrayFromText(def, value, depth);
      if (fromText !== undefined) return fromText;
    }
    const parsed = parseJsonish(value);
    if (parsed !== undefined) {
      const next = coerceValue(inner, parsed, depth + 1);
      if (inner.safeParse(next).success) return next;
    }
  }

  if (Array.isArray(value) && def.typeName === 'ZodTuple' && Array.isArray(def.items)) {
    const items = def.items as z.ZodTypeAny[];
    const rest = def.rest as z.ZodTypeAny | null | undefined;
    const out = value.map((item, index) => coerceValue(items[index] ?? rest ?? z.any(), item, depth + 1));
    if (items.length === 4 && out.length === 3 && out.every((item) => typeof item === 'number')) {
      return [...out, 1];
    }
    return out;
  }

  if (Array.isArray(value) && def.typeName === 'ZodArray' && def.type) {
    const items = value.map((item) => coerceValue(def.type as z.ZodTypeAny, item, depth + 1));
    return items;
  }

  if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
    const raw = def.options as unknown;
    const options = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
    for (const option of options as z.ZodTypeAny[]) {
      const next = coerceValue(option, value, depth + 1);
      if (option.safeParse(next).success) return next;
    }
  }

  if (def.typeName === 'ZodRecord' && def.valueType && value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(value as Record<string, unknown>))
      out[key] = coerceValue(def.valueType as z.ZodTypeAny, sub, depth + 1);
    return out;
  }

  if (def.typeName === 'ZodObject' && value && typeof value === 'object' && !Array.isArray(value)) {
    const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
      const field = shape[key];
      out[key] = field ? coerceValue(field, sub, depth + 1) : sub;
    }
    return fillRequired(inner as z.ZodObject<z.ZodRawShape>, out);
  }

  return value;
}

export function coerceForSchema<T extends z.ZodTypeAny>(schema: T, value: unknown): unknown {
  return coerceValue(schema, value, 0);
}
