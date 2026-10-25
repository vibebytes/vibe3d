export interface PromptArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptInfo {
  name: string;
  title: string;
  description: string;
  arguments?: PromptArg[];
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface PromptPayload {
  description: string;
  messages: PromptMessage[];
}

interface Guide {
  title: string;
  description: string;
  body: string;
}

const GUIDES: Record<string, Guide> = {
  'vibe3d.build': {
    title: '从零搭一个场景',
    description: '建房间 → 分区骨架 → 基础体 → 材质与环境 → 首次出图自检',
    body: [
      '1. vibe3d_room {op:"create"}：建房并绑定会话；之后别再传 room_id。写操作会自动开窗，不要预先调 vibe3d_open_editor。',
      '1b. 需要确认画面是否真的在显示：看 vibe3d_open_editor 返回的 state（connected / opening / not_connected）或 vibe3d_room {op:"get"} 的 editors；editors=0 时改动只写进场景，看不到画面。',
      '2. vibe3d_scene {op:"stats"}：记下基线节点数/三角面，交付前拿同一组数字对比。',
      '3. 先骨架后细节：用 vibe3d_node {op:"create"} 的 kind:"group" 建分区（地面/主体/配景），再把 mesh 挂到组下。',
      '4. 尺寸用真实米：box 的 size 就是长宽高，位置给 transform.p，落地前先确认地面高度。',
      '5. vibe3d_material {op:"create"} → vibe3d_material {op:"assign"}：颜色 [r,g,b,a] 0..1，金属度/粗糙度先取 0/0.8 再微调。',
      '6. vibe3d_stage {op:"env"} 定背景与环境光；需要方向光时用 vibe3d_node {op:"create"} 的 kind:"light"。',
      '7. 每 3~5 个构件就 vibe3d_render {op:"snapshot"}（views:["three_quarter"]）看一眼，别攒到最后。',
      '8. 收尾：vibe3d_scene {op:"validate"} 查悬空/穿模/沉地，vibe3d_scene {op:"stats"} 带 budget 核预算。',
    ].join('\n'),
  },
  'vibe3d.edit': {
    title: '精修已有场景',
    description: '先定位再改：query/get → patch → 原子批 → 冲突处理 → 回滚',
    body: [
      '1. 定位：vibe3d_scene {op:"query"} 支持 kind / tags / parentId / hasChildren / withinBBox；不确定时 vibe3d_scene {op:"get"} 拉全量。',
      '2. 单体改动：vibe3d_node {op:"update"} 只传 patch 字段，不重传整份 transform。',
      '3. 批量或跨节点依赖：vibe3d_apply_ops，op 内可以是数组；带 baseRevision 做乐观锁。',
      '4. 撞上 E_CONFLICT：读 error.data 的 expectRevision / actualRevision / changedPaths，只重放自己那部分。',
      '5. 大量同类构件：vibe3d_node {op:"clone"} 或 vibe3d_node {op:"array"}，别循环 create。',
      '6. 改结构：vibe3d_node {op:"reparent"} / vibe3d_node {op:"group"} / vibe3d_node {op:"attach"}，先确认父子关系再动。',
      '7. 不满意就 vibe3d_scene {op:"undo"} 回退一步；成组实验前用 vibe3d_scene {op:"checkpoint"} 留底。',
    ].join('\n'),
  },
  'vibe3d.render': {
    title: '出图与对照',
    description: '取景 → 单帧/多视角/特写 → 取色与 id-pass → 序列',
    body: [
      '1. 取景：vibe3d_camera {op:"set"} 给 p/target/fov，或用 frame 自动框选目标。',
      '2. 单帧：vibe3d_render {op:"snapshot"}，overlay 可叠加 grid / axes / bbox / scale / dims；scale 与 dims 会带尺寸文字。',
      '3. 多视角对照：vibe3d_render {op:"views"}（front/back/left/right/top/three_quarter），一次拿齐再比。',
      '4. 特写：vibe3d_render {op:"node"} 自动框选单个节点；区域细节用 padding 收紧。',
      '5. 配色核对：vibe3d_render {op:"pick"} 在图上取点或取矩形，直接回颜色与直方图。',
      '6. 需要逐像素定位物体时用 vibe3d_render {op:"id_pass"}，别靠肉眼数。',
      '7. 动画预览：vibe3d_render {op:"sequence"} 按 fps 采帧，任务状态用 vibe3d_job {op:"get"} 查。',
      '8. 每张图都回 revision；下次改完对不上 revision 就说明看的是旧图。',
    ].join('\n'),
  },
  'vibe3d.verify': {
    title: '交付前自证',
    description: '几何体检 → 预算 → 拾取核对 → 截图与 diff 留证',
    body: [
      '1. vibe3d_scene {op:"validate"}：floating / intersect / belowGround / outsideBounds 四类，逐条看返回的 nodeId。',
      '2. vibe3d_scene {op:"stats"}：带 budget{maxNodes,maxTris,maxTextures} 看余量；要硬门禁就加 enforce:true。',
      '3. vibe3d_scene {op:"pick"}：确认「看到的」就是「以为的」，命中点与距离一起看。',
      '4. vibe3d_render {op:"snapshot"}（overlay:["grid","scale"]）：留一张带比例的图当交付证据。',
      '5. vibe3d_scene {op:"diff"}：from/to 之间改了哪些节点、谁改的（authors），写进交付说明。',
      '6. vibe3d_scene {op:"summary"}：一眼看节点/材质/贴图规模，防止漏导资产。',
    ].join('\n'),
  },
  'vibe3d.import': {
    title: '导入资产与场景',
    description: '先探针再入库：inspect → put/import → 对齐落地 → 策略',
    body: [
      '1. 本地文件先 vibe3d_asset {op:"inspect"}：看尺寸、动画、外部引用，决定要不要转换。',
      '2. 外部地址或资产根之外的本地文件用 vibe3d_asset {op:"put"} 入库（本地路径不在根内须传 policy:"allow"），再用 vibe3d_node {op:"import"} 落成节点。',
      '3. 整份场景用 vibe3d_scene {op:"import"}：它是替换语义，只在初始化或回滚时用；先 vibe3d_scene {op:"checkpoint"} 留底。',
      '4. 落地：按 inspect 回的真实包围盒算 y，别假设原点在脚底。',
      '5. 批量摆放用 vibe3d_node {op:"array"} 或 vibe3d_node {op:"transform"}，保持同一朝向基准。',
      '6. 导入后立刻 vibe3d_scene {op:"validate"}，重点看 belowGround 与 intersect。',
    ].join('\n'),
  },
  'vibe3d.history': {
    title: '版本、检查点与回滚',
    description: 'checkpoint → 改动 → diff → restore / undo',
    body: [
      '1. 动手前 vibe3d_scene {op:"checkpoint"} 打点，名字写清意图（before-roof-edit）。',
      '2. 多步改动之间用 vibe3d_scene {op:"diff"} 看 from/to 的节点差异与作者。',
      '3. 单步回退用 vibe3d_scene {op:"undo"}，重做用 vibe3d_scene {op:"redo"}；undo 不记作者。',
      '4. 回到某个点用 vibe3d_scene {op:"restore"}：缺省整份回灌，scope:"subtree" 只回指定子树。',
      '5. 回灌前再打一个检查点，避免把当前状态弄丢。',
      '6. vibe3d_scene {op:"checkpoints"} 查历史，按时间与名字挑，不靠记 revision。',
    ].join('\n'),
  },
};

export const listPrompts = (): PromptInfo[] =>
  Object.entries(GUIDES).map(([name, guide]) => ({
    name,
    title: guide.title,
    description: guide.description,
  }));

export function getPrompt(name: string): PromptPayload {
  const guide = GUIDES[name];
  if (!guide) {
    throw new Error(`E_NO_PROMPT: 未知剧本 ${name}；可选：${Object.keys(GUIDES).join(' / ')}`);
  }
  return {
    description: guide.description,
    messages: [{ role: 'user', content: { type: 'text', text: guide.body } }],
  };
}
