import { z } from 'zod';
import { defOf, unwrap } from './coerce';

export interface RepairResult {
  value: unknown;
  fixes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ALIASES: Record<string, string[]> = {
  nodeId: ['id', 'node', 'nodeid', 'node_id'],
  jobId: ['id', 'job', 'jobid', 'job_id', 'task', 'taskid', 'task_id'],
  roomId: ['room', 'roomid', 'room_id'],
  materialId: ['material', 'materialid', 'material_id'],
  id: ['nodeId', 'node_id', 'materialId', 'material_id'],
  fxId: ['id', 'fx', 'fxid', 'fx_id'],
  sha: ['sha256', 'hash'],
};

const ID_PATTERNS: Record<string, RegExp> = {
  nodeId: /^n_[a-z0-9]{8}$/,
  materialId: /^m_[a-z0-9]{8}$/,
  roomId: /^r_[a-z0-9]{8}$/,
  fxId: /^f_[a-z0-9]{8}$/,
  sha: /^[a-f0-9]{64}$/i,
  jobId: /^([a-f0-9]{16,}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
};

const shapeOf = (schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined => {
  const inner = unwrap(schema);
  const def = defOf(inner);
  if (def.typeName !== 'ZodObject') return undefined;
  return (inner as z.ZodObject<z.ZodRawShape>).shape;
};

const armOptions = (schema: z.ZodTypeAny): z.ZodTypeAny[] => {
  const def = defOf(unwrap(schema));
  const raw = def.options as unknown;
  return raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
};

const keysOf = (schema: z.ZodTypeAny): Set<string> => {
  const inner = unwrap(schema);
  const def = defOf(inner);
  const out = new Set<string>();
  if (def.typeName === 'ZodObject') {
    for (const key of Object.keys((inner as z.ZodObject<z.ZodRawShape>).shape)) out.add(key);
    return out;
  }
  if (def.typeName === 'ZodDiscriminatedUnion' || def.typeName === 'ZodUnion') {
    for (const arm of armOptions(schema)) for (const key of keysOf(arm)) out.add(key);
  }
  return out;
};

const armForTag = (schema: z.ZodTypeAny, value: Record<string, unknown>): z.ZodTypeAny | undefined => {
  const def = defOf(unwrap(schema));
  if (def.typeName !== 'ZodDiscriminatedUnion' || typeof def.discriminator !== 'string') return undefined;
  const raw = def.options as unknown;
  const options = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
  const tag = value[def.discriminator];
  for (const arm of options as z.ZodTypeAny[]) {
    const shape = shapeOf(arm);
    const literal = shape?.[def.discriminator];
    if (literal && defOf(unwrap(literal)).value === tag) return arm;
  }
  return undefined;
};

const armByDiscriminator = (schema: z.ZodTypeAny, value: Record<string, unknown>): z.ZodTypeAny | undefined => {
  const def = defOf(unwrap(schema));
  if (def.typeName !== 'ZodDiscriminatedUnion') return undefined;
  return armForTag(schema, value);
};

function moveKey(input: Record<string, unknown>, from: string, to: string, fixes: string[], path: string): boolean {
  if (!(from in input) || from === to) return false;
  if (to in ID_PATTERNS && typeof input[from] !== 'string') return false;
  if (!(to in input)) input[to] = input[from];
  delete input[from];
  fixes.push(`${path}${from}→${to}`);
  return true;
}

function adoptNestedFields(
  shape: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): void {
  for (const [key, field] of Object.entries(shape)) {
    if (key in input) continue;
    const sub = keysOf(field);
    if (sub.size === 0) continue;
    const nested = Object.keys(input).filter((k) => sub.has(k) && !(k in shape));
    if (nested.length === 0) continue;
    const bag: Record<string, unknown> = {};
    for (const k of nested) {
      bag[k] = input[k];
      delete input[k];
    }
    input[key] = bag;
    fixes.push(`${path}${nested.join(',')}→${key}.{${nested.join(',')}}`);
  }
}

const TRANSFORM_PARTS = ['p', 'r', 's'];

function adoptTransformParts(
  shape: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): void {
  const parts = TRANSFORM_PARTS.filter((key) => key in input && !(key in shape));
  if (parts.length === 0) return;

  const take = (bag: Record<string, unknown>, where: string): void => {
    const transform: Record<string, unknown> = {};
    for (const key of parts) {
      transform[key] = input[key];
      delete input[key];
    }
    bag.transform = transform;
    fixes.push(`${path}${parts.join(',')}→${where}.transform`);
  };

  if (isRecord(input.transform)) {
    for (const key of parts) {
      (input.transform as Record<string, unknown>)[key] = input[key];
      delete input[key];
    }
    fixes.push(`${path}${parts.join(',')}→transform.{}`);
    return;
  }

  for (const [key, field] of Object.entries(shape)) {
    const bag = input[key];
    if (!isRecord(bag) || 'transform' in bag) continue;
    if (!keysOf(field).has('transform')) continue;
    take(bag, key);
    return;
  }
}

function adoptRequiredKeys(
  shape: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): void {
  const missing = Object.entries(shape).filter(([key, field]) => !(key in input) && !field.isOptional());
  if (missing.length === 0) return;

  for (const [key] of missing) {
    for (const alias of ALIASES[key] ?? []) {
      if (moveKey(input, alias, key, fixes, path)) break;
    }
  }

  const orphanStrings = (): Array<[string, string]> =>
    Object.entries(input).filter(
      ([k, v]) => !(k in shape) && typeof v === 'string' && !v.includes(' ') && v.length <= 80,
    ) as Array<[string, string]>;

  for (const [key] of missing) {
    if (key in input) continue;
    const pattern = ID_PATTERNS[key];
    if (!pattern) continue;
    const hit = orphanStrings().find(([, value]) => pattern.test(value));
    if (hit) moveKey(input, hit[0], key, fixes, path);
  }

  const leftovers = missing.filter(([key]) => !(key in input));
  const orphans = orphanStrings();
  if (leftovers.length > 0 && orphans.length === 1) {
    const [only] = orphans;
    const [key] = leftovers[0]!;
    if (only) moveKey(input, only[0], key, fixes, path);
  }
}

function repairObject(
  inner: z.ZodObject<z.ZodRawShape>,
  value: Record<string, unknown>,
  fixes: string[],
  path: string,
): Record<string, unknown> {
  const shape = inner.shape;
  let input = value;

  for (let i = 0; i < 2; i += 1) {
    const keys = Object.keys(input);
    const only = keys.length === 1 ? keys[0] : undefined;
    if (!only || only in shape) break;
    const nested = input[only];
    if (!isRecord(nested)) break;
    fixes.push(`${path}${only}→(unwrapped)`);
    input = nested;
  }

  adoptNestedFields(shape, input, fixes, path);
  adoptTransformParts(shape, input, fixes, path);
  adoptRequiredKeys(shape, input, fixes, path);

  const out: Record<string, unknown> = { ...input };
  for (const [key, field] of Object.entries(shape)) {
    if (!(key in out)) continue;
    out[key] = repairValue(field, out[key], fixes, `${path}${key}.`);
  }
  return out;
}

function repairValue(schema: z.ZodTypeAny, value: unknown, fixes: string[], path: string): unknown {
  const inner = unwrap(schema);
  const def = defOf(inner);

  if (def.typeName === 'ZodArray' && def.type && Array.isArray(value)) {
    return value.map((item, index) => repairValue(def.type as z.ZodTypeAny, item, fixes, `${path}[${index}].`));
  }

  if (def.typeName === 'ZodObject' && isRecord(value)) {
    return repairObject(inner as z.ZodObject<z.ZodRawShape>, value, fixes, path);
  }

  if ((def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') && isRecord(value)) {
    const tagged = armByDiscriminator(schema, value);
    if (tagged) return repairValue(tagged, value, fixes, path);
    const raw = def.options as unknown;
    const options = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
    for (const arm of options as z.ZodTypeAny[]) {
      const attempt = repairValue(arm, value, [], path);
      if (arm.safeParse(attempt).success) {
        return repairValue(arm, value, fixes, path);
      }
    }
  }

  return value;
}

export function repairInput(schema: z.ZodTypeAny, input: unknown): RepairResult {
  if (!isRecord(input)) return { value: input, fixes: [] };
  const fixes: string[] = [];
  return { value: repairValue(schema, input, fixes, ''), fixes };
}
