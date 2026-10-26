# vibe3d MCP 使用反馈整改方案（2026-10-26）

> 输入：外部用户实测反馈 10 条问题 + 优化建议。
> 本文先给「逐条核实结论（带代码证据）」，再给分优先级的整改设计，供 review 后实施。

## 一、总结论

反馈 10 条里，**真正需要新开发的只有 4 件事**（读回闭环、play 语义、单 clip 限制、发布链缺 schema.json）；
**4 条是"代码已修好但对方手里是旧构建"**（at 参数、sequence 逐帧采样、keyframes 支持、material.create 服务端生成 id）；
**1 条根因在 fast 宿主侧**（tool result missing），**1 条是容错口径问题**。

先修发布链 + 送达最新构建，能让对方一半的 P0 直接消失；其余按 P0→P2 落地。

## 二、逐条核实

| # | 反馈 | 核实结论 | 证据 |
|---|------|----------|------|
| 1a | define 后 render.sequence 5 帧相同、hasAnim:false | **两半各一半**：采样链路已在 main 修好；hasAnim 确实仍是 bug | 见 §2.1、§2.2 |
| 1b | snapshot 无 at 参数 | **已修**（spec+透传+默认值全有） | specs/render.ts imageOpts.at；handlers/render.ts:99（doc 有 clip 时 at 默认 0）；render-anim.test.ts |
| 1c | sequence 无法逐帧出图 | **已修**：每帧 frameAt(i) 采样并传 at | handlers/render.ts:388-394 |
| 2 | play 只认 model，与 define 矛盾 | **真实存在**，reducer 硬编码 model-only | scene/src/reduce.ts:370、:390 |
| 3 | keyframes 靠报错逆向、schema 缺失 | **已修**：clipSchema 含 keyframes（type 枚举、channel 枚举、{t,v,ease}）；help 已做 field-level contracts（commit d1a0a47、e1c8943） | protocol/src/scene.ts:39-45 |
| 4 | 颗粒度过细、70+ 次调用 | **真实且更严重**：一节点只挂 **1 条 clip**，第二次 define 直接覆盖第一条 → 多通道组合目前根本不可能 | protocol/src/scene.ts:79（clip 单值）；reduce.ts animation.define 覆盖式写入 |
| 5 | /api/mcp/schema E_SCHEMA_MISSING | **真实存在，发布链 bug**：turbo build 对 mcp 只跑 tsup，不生成 schema.json；只有手动 rebuild.sh 才跑 schema-cli。fast 的 fetch-vibe3d.sh 走 turbo → **装进 fast 的包永远缺 schema.json** | packages/mcp/package.json build=tsup；rebuild.sh mcp 分支多跑 `node dist/schema-cli.js`；当前 dist（16:44）无 schema.json；fetch-vibe3d.sh:50 |
| 6 | 动画无读回路径 | **真实存在**：node.get 输出 schema 无 clip 字段；hasAnim 只认 model 的 anim | specs/scene.ts nodeBriefOut.extend（只有 anim）；scene/src/query.ts:82 |
| 7 | 相机不可动画 | **真实存在**（channel 枚举仅节点 9 通道） | protocol/src/scene.ts:41 |
| 8 | material.create 与文档不符 | **id 部分已修**（服务端 makeMaterialId，回传 presetNote）；**preset 归一仍存在**：clay→concrete 静默别名 | handlers/scene.ts:682-694；scene/src/material.ts:93（clay→concrete）|
| 9 | tool result missing | **根因在 fast 宿主**：history hardCap/截断后 repairToolRounds 合成占位符，大 base64 图片载荷是主要触发器 | agent/modules/core/.../Messages.scala:69；vibe3d render 结果内联 base64 放大了触发概率 |
| 10 | 容错口径不一 | **真实存在**：from/to/fps numIn/intIn 严格数字，字符串 "0"→E_INVALID_PARAMS | specs/render.ts numIn/intIn |

### §2.1 渲染采样闭环已在 main（对方构建旧）

- 快照：EditorRenderer → hub.requestSnapshot 透传 `at`（daemon/src/render/editor.ts）；
- 页面侧：CaptureBridge `animations.seekAll(at)` + `applyProceduralClips(scene, clipsOf(doc), at, clipBasesOf(doc))`（editor/src/viewport/CaptureBridge.tsx:137-144）；
- 无头路径：chromium.ts:80 调同一 `window.__vibe3dCapture`；
- 求值器：packages/scene/src/anim.ts sampleClip（线性+ease 插值、loop/duration/speed）；
- 回归测试已在仓：daemon/test/render-anim.test.ts、anim-sway / anim-scope / anim-persist.test.ts。

**动作**：不是重写，是「跑 rebuild.sh 全量 + 冒烟 + 重新打包 fast」并让对方复测。

### §2.2 但 hasAnim / node.get 读回确实断

- `hasAnim(node) = node.kind === 'model' && Boolean(node.anim)`（scene/src/query.ts:82）——完全忽略 `node.clip`；
- node.get 输出 schema 没有 `clip` 字段，define 之后调用方无从核实挂了什么。

## 三、立即修（发布链，半天内）

1. `packages/mcp/package.json` build 改为 `tsup && node dist/schema-cli.js`（turbo 会自动带上，fetch-vibe3d.sh 无需改）。
2. `scripts/check-bundle.mjs` 增加校验：`packages/mcp/dist/schema.json` 存在且 `generatedAt` 非空，缺失即 fail（打包闸门）。
3. 全量 `scripts/rebuild.sh` + `pnpm test` + smoke，重打 fast 安装包，对方复测。
   预期：反馈 1b/1c/3/8(id) 四条直接关闭。

## 四、P0：动画读回闭环 + 多通道

### P0-1 读回（修 hasAnim / node.clip）

- `query.ts`：`hasAnim = Boolean(node.anim) || Boolean(node.clip)`；
- `specs/scene.ts` nodeBriefOut.extend 增加 `clip`（当前节点 clip 全文）与 `hasClip: boolean`；
- `scene.query` 的 anim 过滤语义同步（`hasAnim=true` 命中 model.anim 或任一 clip）；
- 测试：define 后 node.get 能看到 clip；scene.query hasAnim=true 能召回该节点（修 render-anim.test.ts 现状里被断言的旧行为）。

### P0-2 play 语义统一（低成本版，本期）

程序化 clip 是**无状态时间函数**，渲染本来就按 `at` 采样，play 对它没有意义。本期不做全局时钟，只做语义一致化：

- reducer `animation.play/stop` 对非 model 节点：由 `fail(...)` 改为返回 `{played:false, reason:'procedural'}`（或 AppError 文案改为「程序化 clip 无需 play，直接 render.snapshot at=<秒>；render.sequence 自动逐帧采样」）；
- MCP `vibe3d_animation.play` 工具描述同步；`vibe3d_help` play 条目给出该文案。
- （决策点）后续版本如需编辑器内自动播放，再引入全局时间轴 scene.time，与 P1 相机动画一并设计。

### P0-3 多 clip（70+ 次调用的根治）

- protocol：`nodeBase.clip: ClipSpec` → `clips: ClipSpec[]`（保留旧字段读取一版：`clip` 存在则并入数组；写入只走 clips）；
- `animation.define`：按 `(channel)` 键**追加/替换**，不再整节点覆盖；上限 8 条/节点（超出报 E_LIMIT）；
- `animation.clear` 保留全清，新增可选 `channel` 只清对应通道；
- 渲染端 `applyProceduralClips` 遍历 clips（求值顺序：后定义覆盖先定义，同 channel 互斥）；
- 兼容 GLB 模型节点：`anim` 与 `clips` 并存时 model 播放不受影响。

### P0-4 姿势级抽象（压调用数）

新增 `animation.pose`（scene.apply 复用 wire）：一次定义多节点多通道 keys——

```json
{ "op": "animation.pose", "targets": [
  { "nodeId": "@arm_l", "channel": "rz", "keys": [{"t":0,"v":0},{"t":1,"v":-0.5}] },
  { "nodeId": "@head",  "channel": "ry", "keys": [{"t":0,"v":0},{"t":1,"v":0.3}] }
] }
```

服务端展开为 N 条 define（一次 revision）。人偶全身姿势 ≈ 1 次调用；摆姿势任务从 70+ 降到 ≤10。

## 五、P1：文档/契约/容错

1. **schema 快照上闸门后**，`/api/mcp/schema` 与 tools/list inputSchema 由同一份 `capabilities/generated/mcp.ts` 生成（已实现，随 §三 生效）；help 的 animation.define 条目补 keyframes 完整可运行示例（type/channel/{t,v,ease} 全枚举），不再只给 `{"type":"sway"}`。
2. **容错统一**：render.sequence from/to/fps、at、width/height 等 numIn 改 `z.coerce.number()`（"0"→0）；id 格式错误时 AppError.data 给 `{expected:"m_+8位hex", got:...}`（对齐 apply_ops 的 issues 风格）。
3. **相机动画**（下一版）：channel 枚举扩 `cam_px/cam_py/cam_pz/cam_tx/cam_ty/cam_tz/fov`，define target 允许 `@camera`；渲染时在 CaptureBridge 相机覆盖前采样 doc.camera；render.sequence 即得动态运镜。依赖 P0-3 的多通道结构。

## 六、P2：材质与宿主协同

1. **材质预设**：新增 `clay`（哑光陶土）、`porcelain`（釉面）；未知描述词保持「回退 concrete + note」但不吞 params——文档明确「preset 描述词仅起手，精确控制用 params/material.patch」；help 列出全部预设与别名映射。
2. **结果载荷治理**（协同 fast）：render.snapshot 增加 `saveTo`（落盘 exportsDir，返回 url+bytes，不内联 base64）；MCP 面默认「小图内联（≤512px）/大图落盘引用」双档。fast 侧另行评估 repairToolRounds 对 tool result 的截断策略（图类结果优先保留最近 N 张）。

## 七、验收口径

纯 MCP 面（对最新构建的 daemon）：

1. 对 mesh 节点 define keyframes → `node.get` 返回该 clip 且 hasAnim=true；
2. `render.snapshot(at=0)` 与 `at=1` 画面不同；`render.sequence` 帧间动作连续、字节不全同；
3. 同一节点 define py + define rz 后两条 clip 并存、可分别 clear；
4. `animation.pose` 一次调用完成人偶全身姿势（≤10 次调用完成整个摆姿任务）；
5. `vibe3d_help animation define` 返回 keyframes 完整 schema 与示例，全程无试错；
6. **发布验收**：`pnpm build` 产物含 `packages/mcp/dist/schema.json`；fast 打包后 `/api/mcp/schema` 返回 200，tools/list inputSchema 与 help 一致；
7. 字符串数字参数（"0"→"2"）不再报 E_INVALID_PARAMS。

## 八、排期建议

- 第 1 批（半天）：§三 发布链 + §二.1 动作（重打包、对方复测）；
- 第 2 批（1 天）：P0-1 读回 + P0-2 play 语义 + P0-3 多 clip（protocol/scene/daemon/editor 四点同步改）；
- 第 3 批（1 天）：P0-4 pose + P1 容错 + help 示例；
- 第 4 批（另开任务）：P1 相机动画、P2 材质预设、载荷治理（含 fast 侧协同）。
