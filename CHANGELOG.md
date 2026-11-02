# Changelog

## Unreleased

- CLI 与 MCP 共用 capability spec。命令、参数和 `vibe3d help` 都从 zod schema 生成，不再维护第二份用法字符串。原先没有实现的 17 条命令（`room use`、`anim gait`、`render sequence` 等）以及 `camera project` / `camera unproject` 可以直接调用。
- **Breaking:** CLI 遇到未知 flag 会以退出码 2 报错。`node group --no-keep-world` 会真正发出 `keepWorld:false`。`open` 不再默认发送 `reuse:true`。不带 `--out` 的渲染命令输出 daemon 原始字段 `base64`。任务类命令（`render sequence`、`render video`、`export glb`）默认等待完成，`--no-wait` 立即返回。整份参数底稿用 `--input`，不要用 `--params`（那是 `material create` 的字段）。
- **Breaking:** `mesh.mannequin` 现在生成带骨骼蒙皮的 glTF 并创建 `kind:'model'` 节点（17 根骨骼，`bone.<名>.rotation` 轨道可直接驱动）。返回 `{nodeId, sha, bones, revision}`，移除 `clothNodeId` / `materialId` / `clothMaterialId`；新增 `colors{skin,shirt,shorts,shoes}`，`seed` 改为体型微扰；默认姿势为 `stand`。
- 动画：`@name` 可用于 `animation.*` 目标、`animation.pose` 的 `targets[].nodeId` 与 `fx.create.nodeId`（能力层与 `ops.apply` 批量里都可用，同批先建后引；reducer 收到未解析的 `@` 直接报错）；track 支持 `blend:'additive'`、常量简写 `{path,value}`；clip 支持 `drift` 根运动（按节点自身朝向，转身即转向），tracks 上限 32；编辑器应用 `visible` / `opacity` 轨道，轨道移除后恢复原可见性、原材质与骨骼静止姿态。
- 新增 `animation.gait`（walk / run / idle）：只替换带 `bone.*` 轨道的旧 clip，其余 clip 保留。`mesh.mannequin` 的 GLB 在 `extras.vibe3d` 写入骨架（种子 + 骨骼长度），资产报告带 `gltf.rig`，取景按它做 FK，不再按文件名识别。
- **Breaking:** track 改为严格校验，未知字段（如拼错的 `interp`）直接报 `E_INVALID_PARAMS`，不再静默丢弃。
- **Breaking:** `render.snapshot` / `views` / `node` 及序列渲染在截图前等待模型加载；模型加载失败或 12 秒内未就绪时整次渲染报错，不再输出缺模型的画面。
- `vibe3d_help` 的对象数组字段以 `name[]` 形式列出子字段（如 `targets[].nodeId`），按旧字段名 `targets` 精确匹配的调用方需要调整。
- 渲染：views / node 以 MCP image 块返回；`at` 参与取景；`render.sequence` / `render.video` 支持 `nodeIds` / `view` / `camera` / `isolate`；导出链接在 MCP 层为绝对地址（只改写 `url` / `*Url` 字段），manifest 帧带 `url`，`/exports` 可下载 mp4。
- daemon 空闲退出覆盖 ephemeral 模式：没有房间时按 `--daemon-idle-ms`（默认 30 分钟）退出；有房间（只在内存里）时至少空闲 12 小时才退出，避免孤儿 daemon 无限存活。
- MCP 启动时发现本地 daemon 版本不一致会自动重启它；`--restart-daemon` / `VIBE3D_RESTART_DAEMON=1` 可强制每次启动都重启。
- 多房间/多聊天：所有房间级工具接受可选 `room_id`（只路由本次调用）；进程接触多个房间后不带 `room_id` 的调用被拒绝并列出候选；隐式调用在结果里标注所用房间；`open_editor` 已有房间时不再新建。
- MCP 协议壳改为官方 SDK v2 低层 Server。`instructions` 与真实分组工具名对齐，`serverInfo.version` 与包版本一致。
- `vibe3d-mcp` 精确依赖 `vibe3d-daemon`；daemon 发布包带上 editor 静态资源，并能从安装目录被解析到。
- 增加 Node >=22 前置检查、`--doctor`，以及 MCP Registry 元数据（`io.github.vibebytes/vibe3d`）。
- 开源准备：统一 GitHub/`@vibebyte`/Registry 身份元数据，补齐 Apache-2.0 版权与各包 `license`/`repository`，移除本机绝对路径脚本，删除仓库内私有整改文档，增加 `SECURITY.md` / `CONTRIBUTING.md` / CI；编辑器时间轴默认不自动播放。

## 0.2.0 — 2026-10-27

V2 全量修复（V2-01–V2-15）：对齐 MCP 契约、补投影/验收能力、统一错误与文档语义。

### 新能力
- `camera.project` / `camera.unproject`：世界↔像素投影 API，golden 7 锚点误差 ≤1px；附 demo 脚本。
- `render.assert`：视觉验收 op，串 project+pick 输出 pass/fail、误差 px、ΔE；7 锚点 fixture。
- `camera.set`/`camera.save` 支持 `lens_mm`（36mm 传感器换算）并回读 `fov_h`。
- `room.list` 支持 `name_prefix` / `updated_before` 过滤与 `total`；`room.close` 支持批量 `ids`。

### 行为与契约
- snapshot 默认尊重文档相机；`framing` 显式开关，警告文案重写（V2-01）。
- 错误统一 `{code,message,hint,example,doc_ref}`；`E_PAYLOAD_TOO_LARGE` 携带 `{bytes,limit,tip}`；snake_case 几何字段别名表（V2-04/V2-13）。
- `node.id` 覆盖语义定案 + `upsert_by_name` 幂等重建（V2-09）。
- `apply_ops` 事务语义：dry_run 预检、部分成功返回（V2-15）。
- 材质 create/patch/map 响应回读归一后最终参数（V2-08a）。

### 文档与几何
- 欧拉顺序/fov/ tube 两点圆柱/cone 用法/全局约定块（status + help 首页）文档化（V2-02/06/07a/10）。
- torus / capsule 几何全链路（protocol→scene bake→editor→specs）（V2-07b）。
- render.pick 兼容 `[[x,y]]` 并返回 node/material id（V2-03）。

### 性能
- daemon 渲染空闲 CPU 降低（V2-12）。

### 门禁
- registry 计数 73：`spec.test` 与 §1.2 文档表对齐；`registry-parity` 恢复绿。
- 231 files / 1365 tests 全绿；rebuild.sh 8 包通过；smoke-render 全检查通过。
