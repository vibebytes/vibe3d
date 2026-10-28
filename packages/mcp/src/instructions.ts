export const INSTRUCTIONS = [
  '房间由会话绑定：先调用 vibe3d_room，op 为 create，建房并自动绑定当前会话；切换房间用 vibe3d_room，op 为 use，并传 room_id。此后 vibe3d_scene、vibe3d_node、vibe3d_asset、vibe3d_render 不要传 room_id。',
  '参数约定：长度单位米，Y 轴向上；颜色一律 [r,g,b,a] 四位、0..1（缺 alpha 自动补 1，也接受 "#RRGGBB"）。',
  'id 由服务端生成：node=n_、material=m_、fx=f_、room=r_ + 8 位小写字母数字；工具返回的 id 才是有效 id，不要自己编。',
  '逐条操作用对应工具的 op：vibe3d_node 的 create 或 update，vibe3d_material 的 create，vibe3d_stage 的 env，vibe3d_fx 的 create。vibe3d_apply_ops 只用于原子批量或需要引用新建 id 的依赖场景。',
  '参数字段用 vibe3d_help 查询，传入 tool 与 op。任务剧本按需加载 prompts：vibe3d.build、vibe3d.edit、vibe3d.render、vibe3d.verify、vibe3d.import、vibe3d.history。只在需要完整步骤时读取，不要要求一次性返回全部工具 spec。',
].join('\n');
