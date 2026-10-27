import type { z } from 'zod';
import { defOf, unwrap } from './coerce';

type Def = { typeName?: string; [key: string]: unknown };

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

const armList = (def: Def): z.ZodTypeAny[] => {
  const raw = def.options as unknown;
  return raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
};

const literalOf = (schema: z.ZodTypeAny | undefined): unknown => {
  if (!schema) return undefined;
  const def = defOf(unwrap(schema));
  return def.typeName === 'ZodLiteral' ? def.value : undefined;
};

const fieldAt = (schema: z.ZodTypeAny, key: string): z.ZodTypeAny | undefined => shapeOf(schema)?.[key];

const enumValues = (schema: z.ZodTypeAny | undefined): string[] | undefined => {
  if (!schema) return undefined;
  const def = defOf(unwrap(schema));
  if (def.typeName !== 'ZodEnum') return undefined;
  const raw = def.values as unknown;
  if (Array.isArray(raw)) return raw as string[];
  return raw && typeof raw === 'object' ? Object.values(raw as Record<string, string>) : undefined;
};

const editDistance = (a: string, b: string): number => {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let last = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = prev[j] ?? 0;
      prev[j] = Math.min((prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length] ?? 0;
};

const DISCRIMINATOR_ALIASES: Record<string, string[]> = {
  type: ['kind', 'shape', 'geometryType'],
  kind: ['type', 'nodeType'],
  op: ['action', 'type', 'kind', 'opName'],
};

const TAG_SYNONYMS: Record<string, string> = {
  cube: 'box',
  quad: 'plane',
  plane: 'plane',
  ball: 'sphere',
  tube: 'cylinder',
  capsule: 'capsule',
  donut: 'torus',
  ring: 'torus',
  gltf: 'model',
  glb: 'model',
  empty: 'group',
};

type TagRule = { tag: string; any?: string[]; has?: string[] };

const TAG_RULES: Record<string, TagRule[]> = {
  kind: [
    { tag: 'light', any: ['light'] },
    { tag: 'model', any: ['sha', 'src', 'url', 'assetSha'] },
    { tag: 'mesh', any: ['geometry', 'shape', 'material', 'size', 'radius'] },
  ],
  type: [
    { tag: 'torus', any: ['tube'] },
    { tag: 'cylinder', any: ['radiusTop', 'radiusBottom'] },
    { tag: 'cylinder', any: ['radius'], has: ['height'] },
    { tag: 'plane', any: ['width'] },
    { tag: 'sphere', any: ['radius'] },
    { tag: 'box', any: ['size', 'depth'] },
  ],
};

const inferTag = (key: string, input: Record<string, unknown>): string | undefined => {
  for (const rule of TAG_RULES[key] ?? []) {
    if (rule.any && !rule.any.some((name) => name in input)) continue;
    if (rule.has && !rule.has.every((name) => name in input)) continue;
    return rule.tag;
  }
  return undefined;
};

const canonicalTag = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .toLowerCase()
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .sort()
    .join('.');

const resolveTag = (raw: string, targets: string[]): string | undefined => {
  const value = raw.trim();
  if (!value) return undefined;
  if (targets.includes(value)) return value;
  const lower = value.toLowerCase();
  const exact = targets.find((tag) => tag.toLowerCase() === lower);
  if (exact) return exact;
  const canon = canonicalTag(value);
  const byCanon = targets.find((tag) => canonicalTag(tag) === canon);
  if (byCanon) return byCanon;
  const synonym = TAG_SYNONYMS[lower];
  if (synonym && targets.includes(synonym)) return synonym;
  const byTail = targets.filter((tag) => tag.toLowerCase().split('.').pop() === lower);
  if (byTail.length === 1) return byTail[0];
  const [head, ...tailParts] = lower.split('.');
  const tail = tailParts.join('.');
  if (!tail || tail.length < 5) return undefined;
  const byNear = targets.filter((tag) => {
    const [tagHead, ...tagTail] = tag.toLowerCase().split('.');
    return tagHead === head && editDistance(tail, tagTail.join('.')) <= 1;
  });
  return byNear.length === 1 ? byNear[0] : undefined;
};

const alignDiscriminator = (
  def: Def,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): Record<string, unknown> => {
  const key = typeof def.discriminator === 'string' ? def.discriminator : undefined;
  if (!key) return input;
  const targets = armList(def)
    .map((arm) => literalOf(shapeOf(arm)?.[key]))
    .filter((tag): tag is string => typeof tag === 'string');
  if (targets.length === 0) return input;
  let next = input;
  if (!(key in next)) {
    for (const alias of DISCRIMINATOR_ALIASES[key] ?? []) {
      const candidate = next[alias];
      if (typeof candidate !== 'string') continue;
      const hit = resolveTag(candidate, targets);
      if (!hit) continue;
      next = { ...next, [key]: hit };
      delete next[alias];
      fixes.push(`${path}${alias}→${key}${hit === candidate ? '' : `:${candidate}→${hit}`}`);
      break;
    }
    if (!(key in next)) {
      const inferred = inferTag(key, next);
      if (inferred && targets.includes(inferred)) {
        next = { ...next, [key]: inferred };
        fixes.push(`${path}${key}:缺省→${inferred}`);
      }
    }
  }
  const raw = next[key];
  if (typeof raw === 'string' && !targets.includes(raw)) {
    const hit = resolveTag(raw, targets);
    if (hit) {
      next = { ...next, [key]: hit };
      fixes.push(`${path}${key}:${raw}→${hit}`);
    }
  }
  return next;
};

const NULLABLE_WRAPPERS = new Set([
  'ZodOptional',
  'ZodNullable',
  'ZodDefault',
  'ZodCatch',
  'ZodBranded',
  'ZodReadonly',
  'ZodPipeline',
]);

const allowsNull = (schema: z.ZodTypeAny): boolean => {
  let current: z.ZodTypeAny | undefined = schema;
  for (let i = 0; i < 8 && current; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodNullable') return true;
    if (
      def.typeName === 'ZodUnion' &&
      armList(def).some((arm) => defOf(unwrap(arm)).typeName === 'ZodNull')
    ) {
      return true;
    }
    if (def.typeName === 'ZodEffects' && def.schema) {
      current = def.schema as z.ZodTypeAny;
      continue;
    }
    if (def.typeName && NULLABLE_WRAPPERS.has(def.typeName) && def.innerType) {
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    return false;
  }
  return false;
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

const armByDiscriminator = (
  schema: z.ZodTypeAny,
  value: Record<string, unknown>,
): z.ZodTypeAny | undefined => {
  const def = defOf(unwrap(schema));
  if (def.typeName !== 'ZodDiscriminatedUnion') return undefined;
  return armForTag(schema, value);
};

const syntheticUnion = (options: z.ZodTypeAny[]): Def | undefined => {
  for (const key of Object.keys(TAG_RULES)) {
    const literals = options.map((arm) => literalOf(shapeOf(arm)?.[key]));
    if (literals.every((tag) => typeof tag === 'string')) {
      return { typeName: 'ZodDiscriminatedUnion', discriminator: key, options };
    }
  }
  return undefined;
};

function moveKey(
  input: Record<string, unknown>,
  from: string,
  to: string,
  fixes: string[],
  path: string,
): boolean {
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
    const nested = Object.keys(input).filter((k) => {
      if (!sub.has(k) || k in shape) return false;
      const allowed = enumValues(fieldAt(field, k));
      return !allowed || allowed.includes(String(input[k]));
    });
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

const GEOMETRY_FIELDS = [
  'size',
  'radius',
  'height',
  'width',
  'depth',
  'radiusTop',
  'radiusBottom',
  'segments',
];
const NODE_FIELDS = ['name', 'parent', 'visible', 'transform', 'material', 'tags', 'clip'];

function liftFlatGeometry(
  fields: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): Record<string, unknown> {
  const tag = input.shape ?? input.geometryType;
  if (typeof tag !== 'string' || 'geometry' in input) return input;
  const own = 'geometry' in fields;
  if (!own && (!('node' in fields) || isRecord(input.node))) return input;
  const geometry: Record<string, unknown> = { type: tag };
  const carried = GEOMETRY_FIELDS.filter((key) => key in input);
  for (const key of carried) geometry[key] = input[key];
  const moved = new Set<string>(['shape', 'geometryType', ...(own ? carried : NODE_FIELDS)]);
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!moved.has(key)) rest[key] = input[key];
  }
  if (own) {
    rest.geometry = geometry;
  } else {
    const bag: Record<string, unknown> = { kind: 'mesh', geometry };
    for (const key of NODE_FIELDS) {
      if (key in input) bag[key] = input[key];
    }
    rest.node = bag;
  }
  const list = carried.length > 0 ? `,${carried.join(',')}` : '';
  fixes.push(`${path}shape${list}→geometry`);
  return rest;
}

function flattenGeometryObject(
  shape: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): Record<string, unknown> {
  if (!('shape' in shape) || 'geometry' in shape) return input;
  let holder: Record<string, unknown> | undefined;
  let holderKey: string | undefined;
  if (isRecord(input.geometry)) {
    holder = input;
  } else {
    for (const [key, bag] of Object.entries(input)) {
      if (isRecord(bag) && isRecord((bag as Record<string, unknown>).geometry)) {
        holder = bag as Record<string, unknown>;
        holderKey = key;
        break;
      }
    }
  }
  if (!holder) return input;
  const geo = holder.geometry as Record<string, unknown>;
  const holderRest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(holder)) {
    if (key !== 'geometry') holderRest[key] = value;
  }
  const out = holderKey === undefined ? holderRest : { ...input };
  const type = typeof geo.type === 'string' ? geo.type : undefined;
  if (type && !('shape' in out)) out.shape = type;
  const carried = GEOMETRY_FIELDS.filter((key) => key in geo && !(key in out));
  for (const key of carried) out[key] = geo[key];
  if (holderKey !== undefined) out[holderKey] = holderRest;
  fixes.push(`${path}geometry.{${['type', ...carried].join(',')}}→扁平字段`);
  return out;
}

function unwrapNestedBag(
  shape: Record<string, z.ZodTypeAny>,
  input: Record<string, unknown>,
  fixes: string[],
  path: string,
): void {
  for (const key of Object.keys(input)) {
    if (key in shape) continue;
    const bag = input[key];
    if (!isRecord(bag)) continue;
    const carried = Object.keys(bag).filter((inner) => inner in shape && !(inner in input));
    if (carried.length === 0) continue;
    for (const inner of carried) {
      input[inner] = bag[inner];
      delete bag[inner];
    }
    if (Object.keys(bag).length === 0) delete input[key];
    fixes.push(`${path}${key}.{${carried.join(',')}}→(unwrapped)`);
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

  input = liftFlatGeometry(shape, input, fixes, path);
  input = flattenGeometryObject(shape, input, fixes, path);
  unwrapNestedBag(shape, input, fixes, path);
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
  if (allowsNull(schema) && isRecord(value) && value.enabled === false) {
    fixes.push(`${path}enabled:false→null`);
    return null;
  }
  const inner = unwrap(schema);
  const def = defOf(inner);

  if (def.typeName === 'ZodArray' && def.type && Array.isArray(value)) {
    return value.map((item, index) =>
      repairValue(def.type as z.ZodTypeAny, item, fixes, `${path}[${index}].`),
    );
  }

  if (def.typeName === 'ZodObject' && isRecord(value)) {
    return repairObject(inner as z.ZodObject<z.ZodRawShape>, value, fixes, path);
  }

  if ((def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') && isRecord(value)) {
    const raw = def.options as unknown;
    const options = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
    const disc = typeof def.discriminator === 'string' ? def : syntheticUnion(options as z.ZodTypeAny[]);
    const aligned = disc ? alignDiscriminator(disc, value, fixes, path) : value;
    const tagged = armByDiscriminator(schema, aligned);
    if (tagged) return repairValue(tagged, aligned, fixes, path);
    for (const arm of options as z.ZodTypeAny[]) {
      const attempt = repairValue(arm, structuredClone(aligned), [], path);
      if (arm.safeParse(attempt).success) {
        return repairValue(arm, aligned, fixes, path);
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
