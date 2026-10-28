import { describeOpField, opExample, opFieldDoc } from '@vibebyte/vibe3d-capabilities';
import type { z } from 'zod';
import { OP_NAMES } from './presentation';

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

const FIELD_SHAPES: Record<string, string> = {
  fog: 'fog 是对象 {near, far, color?}（near<far，米制）；关雾传 false 或 null',
  geometry:
    'geometry 按 type 给字段：box{size:[x,y,z]} / sphere{radius} / cylinder{radius,height} 或 {radiusTop,radiusBottom,height} / plane{width,height}；legacy vibe3d_node create 用平铺的 shape+size',
  material:
    'material 可省略（服务端挂默认材质 m_00000000）；可传已存在的材质 id（m_ + 8 位，先用 vibe3d_material {op:"create", preset} 建），或内联材质对象 {"baseColor": [r,g,b,a]}',
  transform: 'transform 是对象 {p:[x,y,z], r:[x,y,z], s:[x,y,z]}（弧度）',
  size: 'size 是数组 [x,y,z]（米）',
};

const shapeFor = (path: ReadonlyArray<string | number>): string | undefined => {
  const leaf = String(path[path.length - 1] ?? '');
  const parent = String(path[path.length - 2] ?? '');
  if (parent === 'geometry' && leaf === 'type') return FIELD_SHAPES.geometry;
  return FIELD_SHAPES[leaf];
};

const WRAPPER_OPS: Record<string, string> = {
  node: 'node.create',
  env: 'env.set',
  stage: 'stage.set',
  camera: 'camera.set',
  fx: 'fx.create',
  asset: 'asset.register',
};

const nestingHint = (field: string, opName: string | undefined): string => {
  const sample = opName ?? WRAPPER_OPS[field] ?? field;
  return `；${sample} 的载荷要包在 ${field} 里、不能平铺在 op 顶层：{op:"${sample}", ${field}:{…}}（apply_ops 用法见 vibe3d_help {tool:"vibe3d_apply_ops"}）`;
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

const canonicalOp = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .toLowerCase()
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .sort()
    .join('.');

const nearestOp = (given: string): string | undefined => {
  const canon = canonicalOp(given);
  const same = OP_NAMES.find((op) => canonicalOp(op) === canon);
  if (same) return same;
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const op of OP_NAMES) {
    const score = editDistance(given, op);
    if (score < bestScore) {
      best = op;
      bestScore = score;
    }
  }
  if (best && bestScore / best.length <= 0.6) return best;
  const tail = OP_NAMES.filter((op) => op.split('.').pop() === given.trim().toLowerCase());
  return tail.length === 1 ? tail[0] : undefined;
};

const opNameHint = (given: string | undefined): string => {
  const near = given ? nearestOp(given) : undefined;
  const received = given ? `（收到 "${given}"）` : '';
  const tails = given ? OP_NAMES.filter((op) => op.split('.').pop() === given.trim().toLowerCase()) : [];
  const suggest = near
    ? `；最接近的是 ${near}`
    : tails.length > 1
      ? `；「${given}」对应多个 op：${tails.join(' / ')}，请写全名`
      : '';
  return `；op 不在合法清单里${received}${suggest}。共 ${OP_NAMES.length} 个合法 op（tools/list 的 ops.items.properties.op.enum 可见），契约用 vibe3d_help {tool:"vibe3d_apply_ops"}`;
};

const missingFieldsHint = (
  opName: string,
  field: string,
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): string => {
  const missing = issues
    .filter(
      (issue) =>
        issue.path[0] === 'ops' &&
        typeof issue.path[1] === 'number' &&
        issue.path[2] === field &&
        /required/i.test(issue.message),
    )
    .map((issue) => String(issue.path[3] ?? ''))
    .filter(Boolean);
  const list = missing.length > 0 ? `：${missing.join(', ')}` : '';
  return `；${opName} 的 ${field} 载荷已就位，但缺必填字段${list}。字段契约见 vibe3d_help {tool:"vibe3d_apply_ops", op:"${opName}"}`;
};

export function paramHint(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
  opName?: string,
  opItem?: Record<string, unknown>,
  rawArgs?: unknown,
): string {
  const firstIndex = issues.find((issue) => issue.path[0] === 'ops' && typeof issue.path[1] === 'number')
    ?.path[1];
  const given = opName ?? findGivenOp(rawArgs, typeof firstIndex === 'number' ? firstIndex : undefined);
  const candidates: Array<{ score: number; text: string }> = [];
  const perOp = new Map<number, number>();
  const leafOps = new Set<number>();
  for (const issue of issues) {
    if (issue.path[0] === 'ops' && typeof issue.path[1] === 'number') {
      perOp.set(issue.path[1], (perOp.get(issue.path[1]) ?? 0) + 1);
      if (issue.path.length >= 4 && shapeFor(issue.path)) leafOps.add(issue.path[1]);
    }
  }
  for (const issue of issues) {
    const idHint = ID_HINTS[issue.message.trim()];
    if (idHint) {
      candidates.push({ score: 100, text: `；${idHint}` });
      continue;
    }
    const [head, index, field] = issue.path;
    const leafShape = shapeFor(issue.path);
    if (
      head === 'ops' &&
      typeof index === 'number' &&
      typeof field === 'string' &&
      issue.path.length >= 4 &&
      leafShape
    ) {
      const nested = opItem !== undefined && field in opItem;
      const base = /^required$/i.test(issue.message) ? 70 : leafShape === FIELD_SHAPES.geometry ? 90 : 80;
      candidates.push({ score: nested ? Math.min(base, 40) : base, text: `；${leafShape}` });
    }
    if (
      head === 'ops' &&
      typeof index === 'number' &&
      field === 'op' &&
      /Invalid discriminator/i.test(issue.message)
    ) {
      candidates.push({ score: 70, text: opNameHint(given) });
      continue;
    }
    if (
      head === 'ops' &&
      typeof index === 'number' &&
      typeof field === 'string' &&
      WRAPPER_OPS[field] &&
      /required/i.test(issue.message)
    ) {
      const wrapped = opItem !== undefined && field in opItem;
      if (wrapped) {
        candidates.push({ score: 60, text: missingFieldsHint(given ?? WRAPPER_OPS[field], field, issues) });
      } else if (!leafOps.has(index)) {
        candidates.push({ score: (perOp.get(index) ?? 0) >= 2 ? 95 : 50, text: nestingHint(field, given) });
      }
      continue;
    }
    if (
      head === 'ops' &&
      typeof index === 'number' &&
      typeof field === 'string' &&
      WRAPPER_OPS[field] &&
      issue.path.length === 4 &&
      /invalid input|expected/i.test(issue.message)
    ) {
      const scattered =
        (perOp.get(index) ?? 0) >= 2 && !(opItem !== undefined && field in opItem) && !leafOps.has(index);
      if (scattered) {
        candidates.push({ score: 95, text: nestingHint(field, given) });
        continue;
      }
      const inner = String(issue.path[3] ?? '');
      const shapeNote = FIELD_SHAPES[inner] ? `${FIELD_SHAPES[inner]}。` : '';
      if (!shapeNote && opItem !== undefined && field in opItem) continue;
      candidates.push({
        score: shapeNote ? 80 : 40,
        text: `；${shapeNote}${WRAPPER_OPS[field]} 的载荷要整体包在 ${field} 里、不能平铺在 op 顶层：{op:"${WRAPPER_OPS[field]}", ${field}:{kind, geometry, material, transform}}`,
      });
      continue;
    }
    if (/Invalid discriminator value/.test(issue.message)) {
      const leaf = String(issue.path[issue.path.length - 1] ?? '');
      const parent = String(issue.path[issue.path.length - 2] ?? '');
      const text =
        leaf === 'type' && parent === 'geometry'
          ? FIELD_SHAPES.geometry
          : leaf === 'kind'
            ? 'node.kind 取 group / mesh / light / model；只给 geometry 时可省略（服务端按 geometry 推断为 mesh）'
            : 'kind 必须是 group / mesh / light / model 之一；基础体直接用 vibe3d_create_node 更省事';
      candidates.push({ score: 60, text: `；${text}` });
      continue;
    }
    const last = String(issue.path[issue.path.length - 1] ?? '');
    if (COLOUR_KEYS.has(last) && /at least 4/.test(issue.message)) {
      candidates.push({
        score: 90,
        text: '；颜色一律 [r,g,b,a]，0..1 四位（3 位会自动补 alpha=1；也接受 "#RRGGBB"）',
      });
      continue;
    }
    const shape = FIELD_SHAPES[last];
    if (
      shape &&
      (/invalid input|required|expected/i.test(issue.message) ||
        (last === 'size' && /at least 3/i.test(issue.message)))
    ) {
      candidates.push({ score: 80, text: `；${shape}` });
    }
    if (head === 'ops' && typeof index === 'number' && typeof field === 'string' && given) {
      const doc = opFieldDoc(given, issue.path.slice(2).map(String));
      if (doc) candidates.push({ score: 45, text: `；${describeOpField(doc)}` });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best && given) {
    const example = opExample(given);
    return example
      ? `；${given} 的字段契约用 vibe3d_help {tool:"vibe3d_apply_ops", op:"${given}"}；最小合法示例 ${example}`
      : '';
  }
  if (best && given && /必填/.test(best.text) && !best.text.includes('示例')) {
    const example = opExample(given);
    return example ? `${best.text}；最小合法示例 ${example}` : best.text;
  }
  return best?.text ?? '';
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const opListOf = (args: unknown): unknown[] | undefined => {
  if (!isRecord(args)) return undefined;
  if (Array.isArray(args.ops)) return args.ops;
  const params = args.params;
  if (isRecord(params) && Array.isArray(params.ops)) return params.ops;
  return undefined;
};

export function findGivenOp(rawArgs: unknown, index?: number): string | undefined {
  const items = opListOf(rawArgs);
  if (!items) return undefined;
  const nameOf = (item: unknown): string | undefined => {
    if (!isRecord(item)) return undefined;
    for (const key of ['op', 'type', 'action', 'opName', 'kind']) {
      const value = item[key];
      if (typeof value === 'string' && value) return value;
    }
    return undefined;
  };
  if (typeof index === 'number') {
    const hit = nameOf(items[index]);
    if (hit) return hit;
  }
  for (const item of items) {
    const hit = nameOf(item);
    if (hit) return hit;
  }
  return undefined;
}

export function opNameAt(
  payload: Record<string, unknown>,
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }>,
): string | undefined {
  const index = issues.find((issue) => issue.path[0] === 'ops' && typeof issue.path[1] === 'number')?.path[1];
  const ops = payload.ops;
  if (typeof index !== 'number' || !Array.isArray(ops)) return undefined;
  const op = (ops[index] as { op?: unknown } | undefined)?.op;
  return typeof op === 'string' ? op : undefined;
}

export function opItemAt(
  payload: Record<string, unknown>,
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }>,
): Record<string, unknown> | undefined {
  const index = issues.find((issue) => issue.path[0] === 'ops' && typeof issue.path[1] === 'number')?.path[1];
  const ops = payload.ops;
  if (typeof index !== 'number' || !Array.isArray(ops)) return undefined;
  const item = ops[index];
  return isRecord(item) ? item : undefined;
}

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
