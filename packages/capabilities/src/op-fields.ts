import { opSchema } from '@vibebyte/vibe3d-protocol';
import type { z } from 'zod';

export interface OpFieldDoc {
  path: string;
  type: string;
  required: boolean;
  description?: string;
}

type Def = { typeName?: string; [key: string]: unknown };
const defOf = (schema: z.ZodTypeAny): Def => (schema as unknown as { _def: Def })._def;

const WRAPPERS = new Set([
  'ZodOptional',
  'ZodNullable',
  'ZodDefault',
  'ZodCatch',
  'ZodBranded',
  'ZodReadonly',
  'ZodPipeline',
  'ZodEffects',
]);

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName && WRAPPERS.has(def.typeName)) {
      const next = (def.innerType ?? def.schema) as z.ZodTypeAny | undefined;
      if (!next) return current;
      current = next;
      continue;
    }
    return current;
  }
  return current;
}

function isRequiredField(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return false;
    if (!def.typeName || !WRAPPERS.has(def.typeName)) return true;
    const next = (def.innerType ?? def.schema) as z.ZodTypeAny | undefined;
    if (!next) return true;
    current = next;
  }
  return true;
}

const unionArms = (def: Def): z.ZodTypeAny[] => {
  const options = def.options;
  if (Array.isArray(options)) return options as z.ZodTypeAny[];
  if (options instanceof Map) return Array.from(options.values()) as z.ZodTypeAny[];
  return [];
};

const shapeOf = (schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined => {
  const def = defOf(unwrap(schema));
  if (def.typeName !== 'ZodObject' || !def.shape) return undefined;
  return (def.shape as () => Record<string, z.ZodTypeAny>)();
};

function typeText(schema: z.ZodTypeAny, depth = 0): string {
  const def = defOf(unwrap(schema));
  const kind = def.typeName ?? '';
  if (kind === 'ZodEnum') return `取 ${((def.values as unknown[]) ?? []).join(' / ')}`;
  if (kind === 'ZodLiteral') return `${String(def.value)}`;
  if (kind === 'ZodString') return 'string';
  if (kind === 'ZodNumber') return 'number';
  if (kind === 'ZodBoolean') return 'boolean';
  if (kind === 'ZodTuple') {
    const items = (def.items as z.ZodTypeAny[]) ?? [];
    return `[${items.map((item) => typeText(item, depth + 1)).join(', ')}]`;
  }
  if (kind === 'ZodArray') return `数组<${typeText(def.type as z.ZodTypeAny, depth + 1)}>`;
  if (kind === 'ZodObject') return depth > 3 ? '对象' : '对象';
  if (kind === 'ZodDiscriminatedUnion') {
    const key = String(def.discriminator ?? 'type');
    const arms = unionArms(def).map((arm) => {
      const shape = shapeOf(arm) ?? {};
      const literal = defOf(shape[key] as z.ZodTypeAny).value;
      return String(literal ?? '?');
    });
    return `按 ${key} 区分：${arms.join(' / ')}`;
  }
  if (kind === 'ZodUnion')
    return unionArms(def)
      .map((arm) => typeText(arm, depth + 1))
      .join(' | ');
  if (kind === 'ZodNullable') return `${typeText(def.innerType as z.ZodTypeAny, depth)} | null`;
  return 'any';
}

function armFor(op: string): Record<string, z.ZodTypeAny> | undefined {
  for (const arm of unionArms(defOf(opSchema))) {
    const shape = shapeOf(arm);
    if (shape && defOf(shape.op as z.ZodTypeAny).value === op) return shape;
  }
  return undefined;
}

const MAX_FIELDS = 400;
const DISPLAY_FIELDS = 60;

const EXPAND = new Set([
  'node',
  'patch',
  'camera',
  'fx',
  'stage',
  'env',
  'asset',
  'doc',
  'map',
  'transform',
  'geometry',
  'light',
  'params',
  'preset',
  'material',
]);

function collect(
  shape: Record<string, z.ZodTypeAny>,
  prefix: string,
  depth: number,
  out: OpFieldDoc[],
): void {
  for (const [name, schema] of Object.entries(shape)) {
    if (out.length >= MAX_FIELDS) return;
    const path = prefix ? `${prefix}.${name}` : name;
    const def = defOf(unwrap(schema));
    const description = typeof def.description === 'string' ? def.description : undefined;
    out.push({
      path,
      type: typeText(schema),
      required: isRequiredField(schema),
      ...(description ? { description } : {}),
    });
    if (depth >= 3 || !EXPAND.has(name)) continue;
    const child = shapeOf(schema);
    if (child && def.typeName === 'ZodObject') {
      collect(child, path, depth + 1, out);
      continue;
    }
    if (def.typeName === 'ZodDiscriminatedUnion') {
      const key = String(def.discriminator ?? 'type');
      for (const arm of unionArms(def)) {
        const armShape = shapeOf(arm);
        if (!armShape) continue;
        const tagNode = armShape[key] as z.ZodTypeAny | undefined;
        const literal = tagNode ? defOf(tagNode).value : undefined;
        collect(armShape, `${path}[${key}=${String(literal ?? '?')}]`, depth + 1, out);
      }
      continue;
    }
    if (def.typeName === 'ZodUnion') {
      for (const arm of unionArms(def)) {
        const armShape = shapeOf(arm);
        if (!armShape) continue;
        const tagNode = (armShape.type ?? armShape.kind) as z.ZodTypeAny | undefined;
        const tag = tagNode ? defOf(tagNode).value : undefined;
        collect(armShape, `${path}[type=${String(tag ?? '?')}]`, depth + 1, out);
      }
    }
  }
}

export function opFieldDocs(op: string): OpFieldDoc[] {
  const shape = armFor(op);
  if (!shape) return [];
  const out: OpFieldDoc[] = [];
  collect(shape, '', 0, out);
  return out;
}

export function mergedFieldDocs(op: string): OpFieldDoc[] {
  const raw = opFieldDocs(op);
  const entry = new Map<
    string,
    { types: Set<string>; requiredAll: boolean; description?: string; chains: Set<string> }
  >();
  const universe = new Map<string, Set<string>>();
  const parentOf = (path: string): string => (path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '');

  for (const doc of raw) {
    const chain = [...doc.path.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]).join('|');
    const path = doc.path.replace(/\[[^\]]+\]/g, '');
    const parent = parentOf(path);
    const seen = universe.get(parent) ?? new Set<string>();
    seen.add(chain);
    universe.set(parent, seen);

    const cur = entry.get(path);
    if (!cur) {
      entry.set(path, {
        types: new Set(doc.type.split(' | ')),
        requiredAll: doc.required,
        description: doc.description,
        chains: new Set([chain]),
      });
      continue;
    }
    for (const part of doc.type.split(' | ')) cur.types.add(part);
    cur.requiredAll = cur.requiredAll && doc.required;
    cur.description ??= doc.description;
    cur.chains.add(chain);
  }

  return [...entry.entries()].slice(0, DISPLAY_FIELDS).map(([path, value]) => {
    const scope = universe.get(parentOf(path)) ?? new Set(['']);
    const covered = [...value.chains].every((chain) => scope.has(chain));
    const universal = covered && value.chains.size >= scope.size;
    const branches = [...value.chains].filter(Boolean).map((chain) => chain.split('|').at(-1) ?? chain);
    const note = universal ? undefined : `仅 ${branches.slice(0, 3).join(' / ')} 分支需要`;
    const description = [value.description, note].filter(Boolean).join('；') || undefined;
    return {
      path,
      type: [...value.types].join(' | '),
      required: universal && value.requiredAll,
      ...(description ? { description } : {}),
    };
  });
}

export function opFieldDoc(op: string, path: ReadonlyArray<string>): OpFieldDoc | undefined {
  const dotted = path.join('.');
  const docs = opFieldDocs(op);
  const exact = docs.find((doc) => doc.path === dotted);
  if (exact) return exact;
  for (let i = path.length - 1; i > 0; i -= 1) {
    const suffix = path.slice(i).join('.');
    const hit = docs
      .filter((doc) => doc.path.replace(/\[[^\]]+\]/g, '').endsWith(`.${suffix}`))
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (hit) return hit;
  }
  return undefined;
}

export function describeOpField(doc: OpFieldDoc): string {
  const flag = doc.required ? '必填' : '可选';
  const note = doc.description ? `：${doc.description}` : '';
  return `${doc.path}（${doc.type}，${flag}）${note}`;
}
