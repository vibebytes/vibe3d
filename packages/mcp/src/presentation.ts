import { type McpToolDoc, describeCapability } from '@vibebyte/vibe3d-capabilities';

const OP_EXTRA: Record<string, string> = {
  'vibe3d_node#create': "基础体/组/灯光，返回 nodeId；material 可省略（自动建材质），color 用 '#RRGGBB'",
  'vibe3d_node#update': '只传要改的字段（patch 语义）；颜色一律 [r,g,b,a]',
  'vibe3d_node#transform': '批量变换：ids 或 filter 二选一，一次撤销',
  'vibe3d_material#create': '按预设建材质，返回 materialId；精细调整用 material.patch',
  'vibe3d_material#assign': 'material 必须是已存在的 m_ + 8 位 id',
  'vibe3d_status#status': '含 id-pass 支持；渲染或导入前先查一次',
  'vibe3d_apply_ops#apply': '仅用于原子批量或跨节点依赖；日常请用专用 op',
  'vibe3d_scene#import': '整场景替换，仅用于初始化或回滚',
  'vibe3d_render#snapshot': '前提：有在线 editor 或已启用离屏渲染；不确定先 vibe3d_status',
  'vibe3d_render#id_pass': '前提：渲染器支持 id-pass；不确定先 vibe3d_status，不支持改用 snapshot',
  'vibe3d_fx#create': 'id 由服务端生成，不要复用已有 id',
  'vibe3d_mesh#decal': "文字或图片贴花；color/background 用 [r,g,b,a] 或 '#RRGGBB'",
  'vibe3d_stage#env': '颜色一律 [r,g,b,a] 四位（3 位自动补 alpha=1）',
};

const TOOL_EXTRA: Record<string, string> = {
  vibe3d_render: '渲染前先 vibe3d_status 探能力',
  vibe3d_apply_ops: '逐条操作请用专用工具',
  vibe3d_stage: '颜色一律 [r,g,b,a]',
  vibe3d_material: 'material id 由服务端生成，不要自己编',
  vibe3d_fx: 'id 由服务端生成，不要复用已有 id',
  vibe3d_mesh: "decal 用真字形/图片；color 用 [r,g,b,a] 或 '#RRGGBB'",
};

const brief = (tool: McpToolDoc): string => {
  const [first] = tool.ops;
  if (!first) return tool.title;
  if (tool.ops.length === 1) {
    const extra = [OP_EXTRA[`${tool.name}#${first.op}`], TOOL_EXTRA[tool.name]]
      .filter(Boolean)
      .join('｜');
    return extra ? `${tool.title}｜${extra}` : tool.title;
  }
  const ops = tool.ops
    .map(({ op, capability }) => {
      const required = describeCapability(capability)
        .params.filter((p) => p.required)
        .map((p) => p.name);
      return required.length > 0 ? `${op}{${required.join(',')}}` : op;
    })
    .join(' ');
  const extra = TOOL_EXTRA[tool.name];
  return `${tool.title}｜op: ${ops}｜其余字段见 vibe3d_help {tool:"${tool.name}", op}${extra ? `｜${extra}` : ''}`;
};

export const describeTool = (tool: McpToolDoc): string => `[${tool.name.slice(7)}] ${brief(tool)}`;

const LOOSE_OPS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      items: { type: 'object' },
      description: 'op 数组，元素如 {op:"node.create", kind:"box"}；字段见 vibe3d_help',
    },
    room_id: { type: 'string', description: '省略则用当前会话房间' },
  },
  required: ['ops'],
  additionalProperties: true,
};

export const presentSchema = (tool: McpToolDoc): unknown =>
  tool.name === 'vibe3d_apply_ops' ? LOOSE_OPS_SCHEMA : tool.inputSchema;
