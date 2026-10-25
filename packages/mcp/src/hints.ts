import type { z } from 'zod';

const ID_HINTS: Record<string, string> = {
  'invalid material id':
    '材质 id 形如 m_ + 8 位小写字母数字（如 m_a1b2c3d4）；也可省略 id，直接用 vibe3d_create_material 让服务端生成',
  'invalid node id':
    '节点 id 形如 n_ + 8 位小写字母数字（如 n_a1b2c3d4）；新建节点请用 vibe3d_create_node（服务端生成 id）',
  'invalid fx id':
    '特效 id 形如 f_ + 8 位小写字母数字（如 f_a1b2c3d4）；新建特效请用 vibe3d_create_fx（服务端生成 id）',
  'invalid room id': '房间 id 形如 r_ + 8 位小写字母数字（如 r_a1b2c3d4）',
  'invalid sha256': 'sha256 需要 64 位小写十六进制；上传素材用 vibe3d_put_asset 拿 sha',
};

const COLOUR_KEYS = new Set(['color', 'background', 'ambient', 'baseColor', 'emissive']);

export function paramHint(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): string {
  for (const issue of issues) {
    const idHint = ID_HINTS[issue.message.trim()];
    if (idHint) return `；${idHint}`;
    if (/Invalid discriminator value/.test(issue.message)) {
      return '；kind 必须是 group / mesh / light / model 之一；基础体直接用 vibe3d_create_node 更省事';
    }
    const last = String(issue.path[issue.path.length - 1] ?? '');
    if (COLOUR_KEYS.has(last) && /at least 4/.test(issue.message)) {
      return '；颜色一律 [r,g,b,a]，0..1 四位（3 位会自动补 alpha=1；也接受 "#RRGGBB"）';
    }
  }
  return '';
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
]);

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let i = 0; i < 8; i += 1) {
    const def = defOf(current);
    if (def.typeName === 'ZodEffects' && def.schema) {
      current = def.schema as z.ZodTypeAny;
      continue;
    }
    if (def.typeName && WRAPPERS.has(def.typeName) && def.innerType) {
      current = def.innerType as z.ZodTypeAny;
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

function childAt(schema: z.ZodTypeAny, path: ReadonlyArray<string | number>): z.ZodTypeAny | undefined {
  let current: z.ZodTypeAny | undefined = schema;
  for (const key of path) {
    if (!current) return undefined;
    const def = defOf(unwrapSchema(current));
    if (def.typeName === 'ZodObject' && def.shape) {
      current = (def.shape as () => Record<string, z.ZodTypeAny>)()[String(key)];
      continue;
    }
    if (def.typeName === 'ZodArray' && typeof key === 'number') {
      current = def.type as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
      current = unionArms(def)
        .map((arm) => childAt(arm, [key]))
        .find((hit) => hit !== undefined);
      continue;
    }
    return undefined;
  }
  return current;
}

function enumOptions(schema: z.ZodTypeAny): unknown[] {
  const def = defOf(unwrapSchema(schema));
  if (def.typeName === 'ZodEnum') return [...((def.values as readonly unknown[]) ?? [])];
  if (def.typeName === 'ZodLiteral') return [def.value];
  if (def.typeName === 'ZodNativeEnum' && def.values) {
    const values = def.values as Record<string, unknown>;
    return Object.values(values).filter((v) => typeof v === 'string' || typeof v === 'number');
  }
  if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
    return unionArms(def).flatMap((arm) => enumOptions(arm));
  }
  return [];
}

function objectArms(schema: z.ZodTypeAny): Array<Record<string, z.ZodTypeAny>> {
  const def = defOf(unwrapSchema(schema));
  if (def.typeName === 'ZodObject' && def.shape) {
    return [(def.shape as () => Record<string, z.ZodTypeAny>)()];
  }
  if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
    return unionArms(def).flatMap((arm) => objectArms(arm));
  }
  return [];
}

function sampleFor(schema: z.ZodTypeAny): string {
  const def = defOf(unwrapSchema(schema));
  if (def.typeName === 'ZodString') return '"..."';
  if (def.typeName === 'ZodNumber') return '0';
  if (def.typeName === 'ZodBoolean') return 'true';
  if (def.typeName === 'ZodArray') return '[]';
  if (def.typeName === 'ZodObject') return '{}';
  const options = enumOptions(schema);
  return options.length ? JSON.stringify(options[0]) : '"..."';
}

function objectExample(schema: z.ZodTypeAny): string | undefined {
  const arms = objectArms(schema);
  const named = arms.find((shape) => shape.preset) ?? arms.find((shape) => Object.keys(shape).length > 0);
  if (!named) return undefined;
  const key = named.preset ? 'preset' : Object.keys(named)[0];
  const child = key ? named[key] : undefined;
  if (!key || !child) return undefined;
  return `{${JSON.stringify(key)}: ${sampleFor(child)}}`;
}

const isRecord = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function schemaHint(
  input: Record<string, unknown>,
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
  schema: z.ZodTypeAny,
): string {
  const issue = issues[0];
  const field = issue ? issue.path[0] : undefined;
  if (!issue || typeof field !== 'string') return '';
  const value = input[field];
  if (isRecord(value)) return '';
  const node = childAt(schema, issue.path) ?? childAt(schema, [field]);
  if (!node) return '';
  const target = defOf(unwrapSchema(node));
  const isArray = target.typeName === 'ZodArray' || target.typeName === 'ZodTuple';
  const message = issue.message.trim();
  const enumMismatch = /invalid enum|invalid discriminator/i.test(message);
  const objectMismatch = /expected object/i.test(message);
  const arrayMismatch = /expected array/i.test(message);
  const unionFallback = /^invalid input$/i.test(message);
  if (!enumMismatch && !objectMismatch && !arrayMismatch && !unionFallback && !isArray) return '';
  if (arrayMismatch || (isArray && !Array.isArray(value))) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^[\[{]/.test(trimmed)) {
        try {
          JSON.parse(trimmed);
        } catch (err) {
          return `；${field} 需要数组，字符串 JSON 解析失败（${(err as Error).message}）`;
        }
      } else {
        return `；${field} 需要数组，收到的是普通字符串（不是 JSON）`;
      }
    }
    return `；${field} 需要数组：请直接传 JSON 数组（不是字符串）`;
  }
  if (typeof value !== 'string') return '';
  const options = enumOptions(node);
  const list = options.map((option) => String(option)).join(' / ');
  const example = objectExample(node);
  if ((objectMismatch || unionFallback) && example) {
    return `；${field} 是对象，例如 ${example}${list ? `（也可直接传预设名 ${list}）` : ''}`;
  }
  if (list) return `；${field} 只接受 ${list}${example ? `，或对象写法 ${example}` : ''}`;
  return '';
}
