# Changelog

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
