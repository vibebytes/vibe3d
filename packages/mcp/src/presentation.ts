interface Advertised {
  name: string;
  title: string;
  capability: string;
  inputSchema: unknown;
}

const EXTRA: Record<string, string> = {
  vibe3d_apply_ops:
    '⚠️ 逐条操作请用专用工具（create_node / update_node / create_material / set_environment）；本工具仅用于原子批量或跨节点依赖。ops 为对象数组；颜色 [r,g,b,a]。',
  vibe3d_import_scene:
    '整场景替换，仅用于初始化或回滚；逐条修改请用专用工具。doc 字段以校验返回为准，可先 vibe3d_export_scene 取一份。',
  vibe3d_create_node:
    "基础体 / 组 / 灯光，返回 nodeId（服务端生成）。material 可省略（自动建材质）；color 用 '#RRGGBB'。",
  vibe3d_update_node: '只传要改的字段（patch 语义）；颜色一律 [r,g,b,a]，0..1。',
  vibe3d_create_material:
    '按预设建材质，返回 materialId；id 由服务端生成，不要自己编。精细调整用 vibe3d_patch_material。',
  vibe3d_patch_material: '局部更新材质：只传要改的字段；颜色一律 [r,g,b,a]，0..1。',
  vibe3d_assign_material: 'material 必须是已存在的 m_ + 8 位 id；先 vibe3d_create_material 取返回值。',
  vibe3d_create_fx: 'id 由服务端生成；不要复用已有 id，换特效请新建。',
  vibe3d_set_environment: '设置背景 / 环境光 / 雾。颜色一律 [r,g,b,a]，0..1 四位（3 位会自动补 alpha=1）。',
  vibe3d_create_decal: "文字或图片贴花；color / background 用 [r,g,b,a] 或 '#RRGGBB'，fontSize 8-512。",
};

const LOOSE: Record<string, unknown> = {
  vibe3d_apply_ops: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      ops: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        items: { type: 'object', required: ['op'], properties: { op: { type: 'string' } } },
        description: 'op 对象数组（不要传 JSON 字符串）；字段以服务端校验返回为准',
      },
      dryRun: { type: 'boolean', description: '只校验不落盘' },
      baseRevision: { type: 'integer', minimum: 0, description: '乐观锁：期望的当前 revision' },
      opId: { type: 'string', description: '幂等键' },
    },
    required: ['ops'],
    additionalProperties: false,
  },
  vibe3d_import_scene: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      doc: { type: 'object', description: '整份场景文档；字段以服务端校验返回为准' },
      expectRevision: { type: 'integer', minimum: 0 },
    },
    required: ['doc'],
    additionalProperties: false,
  },
};

export const describeTool = (tool: Advertised): string => {
  const group = tool.capability.split('.')[0] ?? 'misc';
  const body = EXTRA[tool.name] ? `${tool.title}\n${EXTRA[tool.name]}` : tool.title;
  return `[${group}] ${body}`;
};

export const presentSchema = (tool: Advertised): unknown => LOOSE[tool.name] ?? tool.inputSchema;
