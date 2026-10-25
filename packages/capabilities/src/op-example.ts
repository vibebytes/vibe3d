import { opSchema } from '@vibebyte/vibe3d-protocol';
import type { z } from 'zod';

type Def = { typeName?: string; [key: string]: unknown };
const defOf = (schema: z.ZodTypeAny): Def => (schema as unknown as { _def: Def })._def;

let preferredKinds: string[] = [];

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

const unionArms = (def: Def): z.ZodTypeAny[] => {
  const options = def.options;
  if (Array.isArray(options)) return options as z.ZodTypeAny[];
  if (options instanceof Map) return Array.from(options.values()) as z.ZodTypeAny[];
  return [];
};

interface Check {
  kind?: string;
  value?: number;
  inclusive?: boolean;
  regex?: RegExp;
}

const checksOf = (def: Def): Check[] => (def.checks as Check[]) ?? [];

function stringSample(def: Def): string {
  const checks = checksOf(def);
  const pattern = checks.find((check) => check.kind === 'regex')?.regex;
  if (pattern) {
    if (/\[0-9a-f\]\{64\}/.test(pattern.source)) return 'a'.repeat(64);
    if (/^#/.test(pattern.source)) return '#000000';
    const prefix = /([a-z])_\[?[a-z0-9]/.exec(pattern.source);
    if (prefix) return `${prefix[1]}_a1b2c3d4`;
  }
  const min = checks.find((check) => check.kind === 'min')?.value ?? 1;
  return 'x'.repeat(Math.min(Math.max(1, Math.ceil(min)), 12));
}

const NUMBER_DEFAULTS: Record<string, number> = {
  opacity: 1,
  roughness: 0.5,
  metalness: 0,
  emissiveIntensity: 1,
  intensity: 1,
  strength: 1,
  exposure: 1,
  fov: 50,
  near: 0.1,
  far: 1000,
  radius: 1,
  width: 1,
  height: 1,
  depth: 1,
};

function clampToChecks(value: number, checks: Check[]): number {
  let out = value;
  for (const check of checks) {
    if (typeof check.value !== 'number') continue;
    if (check.kind === 'min') {
      const floor = check.inclusive === false ? check.value + 0.001 : check.value;
      if (out < floor) out = floor;
    }
    if (check.kind === 'max') {
      const ceil = check.inclusive === false ? check.value - 0.001 : check.value;
      if (out > ceil) out = ceil;
    }
  }
  return checks.some((check) => check.kind === 'int') ? Math.round(out) : out;
}

function numberSample(def: Def, key?: string): number {
  const checks = checksOf(def);
  const preset = key ? NUMBER_DEFAULTS[key] : undefined;
  if (preset !== undefined) return clampToChecks(preset, checks);
  const min = checks.find((check) => check.kind === 'min');
  if (min && typeof min.value === 'number') {
    const base = min.inclusive === false ? min.value + 1 : min.value;
    return checks.some((check) => check.kind === 'int') ? Math.ceil(base) : base;
  }
  return 0;
}

const BOOLEAN_DEFAULTS: Record<string, boolean> = {
  visible: true,
  enabled: true,
  castShadow: true,
  receiveShadow: true,
};

function arrayCount(def: Def): number {
  const checks = checksOf(def);
  const min = checks.find((check) => check.kind === 'min');
  if (min && typeof min.value === 'number') return Math.max(0, Math.min(Math.ceil(min.value), 3));
  const length = checks.find((check) => check.kind === 'length');
  if (length && typeof length.value === 'number') return Math.min(length.value, 3);
  return 0;
}

function sample(schema: z.ZodTypeAny, depth: number, key?: string): unknown {
  if (depth > 6) return null;
  const def = defOf(unwrap(schema));
  switch (def.typeName) {
    case 'ZodLiteral':
      return def.value;
    case 'ZodEnum':
      return ((def.values as unknown[]) ?? [])[0];
    case 'ZodString':
      return stringSample(def);
    case 'ZodNumber':
      return numberSample(def, key);
    case 'ZodBoolean':
      return key ? (BOOLEAN_DEFAULTS[key] ?? false) : false;
    case 'ZodNull':
    case 'ZodUndefined':
      return null;
    case 'ZodTuple': {
      const items = (def.items as z.ZodTypeAny[]) ?? [];
      return items.map((item) =>
        defOf(unwrap(item)).typeName === 'ZodNumber' ? 1 : sample(item, depth + 1),
      );
    }
    case 'ZodArray':
      return Array.from({ length: arrayCount(def) }, () => sample(def.type as z.ZodTypeAny, depth + 1));
    case 'ZodRecord':
    case 'ZodMap':
      return {};
    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)() ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(shape)) {
        if (!isRequired(child)) continue;
        out[key] = sample(child, depth + 1, key);
      }
      return out;
    }
    case 'ZodDiscriminatedUnion': {
      const key = String(def.discriminator ?? 'type');
      const arms = unionArms(def).slice();
      if (preferredKinds.length > 0) {
        const literalOf = (arm: z.ZodTypeAny): string => {
          const armDef = defOf(arm);
          const shape = armDef.shape as (() => Record<string, z.ZodTypeAny>) | undefined;
          const node = shape?.()[key];
          return node ? String(defOf(node).value) : '';
        };
        arms.sort((a, b) => {
          const ai = preferredKinds.indexOf(literalOf(a));
          const bi = preferredKinds.indexOf(literalOf(b));
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        });
      }
      for (const arm of arms) {
        const candidate = sample(arm, depth + 1);
        if (schema.safeParse(candidate).success) return candidate;
      }
      return sample(arms[0] as z.ZodTypeAny, depth + 1);
    }
    case 'ZodUnion': {
      for (const arm of unionArms(def)) {
        const candidate = sample(arm, depth + 1);
        if (schema.safeParse(candidate).success) return candidate;
      }
      return sample(unionArms(def)[0] as z.ZodTypeAny, depth + 1);
    }
    default:
      return null;
  }
}

function isRequired(schema: z.ZodTypeAny): boolean {
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

export function buildOpSample(op: string): unknown {
  preferredKinds = op === 'node.create' ? ['mesh', 'light', 'group', 'model'] : [];
  for (const arm of unionArms(defOf(opSchema))) {
    const def = defOf(unwrap(arm));
    if (def.typeName !== 'ZodObject' || !def.shape) continue;
    const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
    if (defOf(shape.op as z.ZodTypeAny).value !== op) continue;
    return sample(arm, 0);
  }
  return undefined;
}

export function opExample(op: string): string | undefined {
  const example = buildOpSample(op);
  if (example === undefined || !opSchema.safeParse(example).success) return undefined;
  return JSON.stringify(example);
}
