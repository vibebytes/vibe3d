import { type McpToolDoc, describeCapability } from '@vibebyte/vibe3d-capabilities';
import { opSchema } from '@vibebyte/vibe3d-protocol';

const OP_EXTRA: Record<string, string> = {
  'vibe3d_status#status': '含 id-pass 支持；渲染或导入前先查一次',
  'vibe3d_export_glb#glb': '拿到 jobId 后轮询 vibe3d_job.get 到 state=done（失败看 error）',
  'vibe3d_open_editor#open': '返回 url 与 hint；open:false 只回链接',
  'vibe3d_apply_ops#apply':
    '嵌套载荷包在同名字段 {op:"node.create",node:{…}} / {op:"env.set",env:{…}}，不能平铺到 op 顶层（会校验失败）；ops 传数组不是 JSON 字符串。逐条操作请用专用工具',
};

const MULTI_OP_EXTRA: Record<string, string> = {
  vibe3d_node: 'create 平铺传 kind+shape+size，material 可省略（自动建）',
  vibe3d_stage:
    'set/env 的字段平铺在顶层（勿包成 stage:{…}）：env 传 background/ambient/fog，颜色 [r,g,b,a]，fog 是对象 {near,far}、关雾传 false',
  vibe3d_camera: 'set 平铺 p/target/fov，勿包成 camera:{…}；save 用命名机位',
  vibe3d_material:
    'create 收 {preset}，id 由服务端生成；preset 任意描述词都收（如 matte-white 会归一到 concrete + 浅色），原名回读在 preset/presetNote；patch 用 baseColor（也接受 color 别名）/metalness/roughness/emissive/opacity',
  vibe3d_render: 'snapshot / views 前先 vibe3d_status 探能力',
  vibe3d_mesh: "decal 用真字形/图片；color 用 [r,g,b,a] 或 '#RRGGBB'",
  vibe3d_fx: 'id 由服务端生成，不要复用已有 id',
  vibe3d_scene: 'import 是整场景替换，仅用于初始化或回滚',
};

const brief = (tool: McpToolDoc): string => {
  const [first] = tool.ops;
  if (!first) return tool.title;
  if (tool.ops.length === 1) {
    const extra = OP_EXTRA[`${tool.name}#${first.op}`];
    return extra ? `${tool.title}｜${extra}` : tool.title;
  }
  const doc = (capability: Parameters<typeof describeCapability>[0]) => describeCapability(capability);
  const mixed = new Set(tool.ops.map(({ capability }) => doc(capability).mutating)).size > 1;
  const reads: string[] = [];
  const writes: string[] = [];
  for (const { op, capability } of tool.ops) {
    (mixed && doc(capability).mutating ? writes : reads).push(op);
  }
  const lane = (list: string[], tag: string) => (list.length > 0 ? `${tag}${list.join(' ')}` : '');
  const ops = mixed
    ? [lane(reads, '[read] '), lane(writes, '[write] ')].filter(Boolean).join('；')
    : reads.join(' ');
  const extra = MULTI_OP_EXTRA[tool.name];
  return `${tool.title}｜op: ${ops}｜必填见 params 描述，字段见 vibe3d_help {tool, op}${extra ? `｜${extra}` : ''}`;
};

export const describeTool = (tool: McpToolDoc): string => `[${tool.name.slice(7)}] ${brief(tool)}`;

type ZodArm = { _def: { shape: () => Record<string, ZodLike> } };
type ZodLike = { _def: { typeName?: string; value?: unknown; innerType?: ZodLike; schema?: ZodLike } };

const UNWRAP = new Set(['ZodOptional', 'ZodNullable', 'ZodDefault', 'ZodCatch', 'ZodEffects', 'ZodReadonly']);
const COMPOSITE = new Set([
  'ZodObject',
  'ZodDiscriminatedUnion',
  'ZodUnion',
  'ZodIntersection',
  'ZodRecord',
  'ZodLazy',
]);

const unwrap = (schema: ZodLike): ZodLike => {
  let current = schema;
  for (let i = 0; i < 6; i += 1) {
    const inner = current._def.innerType ?? current._def.schema;
    if (!current._def.typeName || !UNWRAP.has(current._def.typeName) || !inner) return current;
    current = inner;
  }
  return current;
};

const armTable = (arm: ZodArm): { op: string; fields: string[]; required: string[]; wrapped: boolean } => {
  let op = '';
  const fields: string[] = [];
  const required: string[] = [];
  let wrapped = false;
  for (const [key, schema] of Object.entries(arm._def.shape())) {
    if (key === 'op') {
      op = String(schema._def.value);
      continue;
    }
    const optional = schema._def.typeName === 'ZodOptional';
    const body = COMPOSITE.has(unwrap(schema)._def.typeName ?? '') ? ':{…}' : '';
    if (body) wrapped = true;
    fields.push(`${key}${optional ? '?' : ''}${body}`);
    if (!optional) required.push(key);
  }
  return { op, fields, required, wrapped };
};

const ARMS = [
  ...(opSchema as unknown as { _def: { options: Map<string, ZodArm> } })._def.options.values(),
].map(armTable);

export const OP_NAMES = ARMS.map((arm) => arm.op);

const OP_TABLE = ARMS.map(({ op, fields }) => `${op}{${fields.join(',')}}`).join(' ');

/** 只给复合载荷的 op 生成 oneOf：模型栽在「wrapper 包哪一层」，其余 op 靠描述表 */
const WRAPPED_ONE_OF = ARMS.filter(({ wrapped }) => wrapped).map(({ op, required }) => ({
  type: 'object',
  properties: { op: { const: op } },
  required: ['op', ...required],
}));

const OPS_DESCRIPTION = [
  '按顺序原子执行；每个元素是 {op:"名字", ...字段}。',
  '复合载荷要包在同名字段里，不能平铺在 op 顶层：node.create 传 {op,node:{…}}、env.set 传 {op,env:{…}}、stage.set 传 {op,stage:{…}}、camera.set 传 {op,camera:{…}}、fx.create 传 {op,fx:{…}}。',
  `op 与顶层字段：${OP_TABLE}。`,
  '字段细节见 vibe3d_help {tool:"vibe3d_apply_ops", op:"node.create"}。',
].join('');

const OPS_EXAMPLES = [
  {
    op: 'node.create',
    node: {
      kind: 'group',
      name: 'pivot',
      parent: null,
      visible: true,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    },
  },
  {
    op: 'node.create',
    node: {
      kind: 'mesh',
      name: 'box1',
      parent: '@pivot',
      visible: true,
      geometry: { type: 'box', size: [1, 1, 0.2] },
      material: 'm_ab12cd34',
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    },
  },
  { op: 'env.set', env: { background: [0.1, 0.1, 0.1, 1] } },
  { op: 'node.update', id: '@box1', patch: { transform: { p: [0, 0.5, 0] } } },
  { op: 'node.reparent', id: '@box1', parent: '@pivot' },
];

export const applyOpsSchema = (): unknown => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      description: OPS_DESCRIPTION,
      items: {
        type: 'object',
        properties: { op: { type: 'string', enum: OP_NAMES } },
        required: ['op'],
        oneOf: WRAPPED_ONE_OF,
      },
      examples: OPS_EXAMPLES,
    },
    room_id: { type: 'string', description: '省略则用会话默认房间；多房间或多聊天并行时必须显式传' },
  },
  required: ['ops'],
  additionalProperties: true,
});

export const presentSchema = (tool: McpToolDoc): unknown =>
  tool.name === 'vibe3d_apply_ops' ? applyOpsSchema() : tool.inputSchema;
