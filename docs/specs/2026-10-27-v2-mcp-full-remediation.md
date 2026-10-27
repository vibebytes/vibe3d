# vibe3D MCP 全量修复计划（V2-01–V2-15）验收记录

日期：2026-10-27 · 计划：plan 01a17d29（21 todos）· 分支：主开发线，逐项英文 commit

## 结果

全量 `vitest run`：**231 files / 1365 tests 全绿**；`scripts/rebuild.sh` 8 包重建通过；`scripts/smoke-render.mjs` 全检查通过（health / snapshot PNG / editor URL / glb export / token 防篡改 401，`failed: []`）。

## 分项对照

| 条目 | 内容 | commit |
| --- | --- | --- |
| V2-01 | snapshot 默认尊重 doc camera，framing 显式开关，警告文案重写 | cb47948 |
| V2-02 | transform.r 单位与欧拉顺序文档化，help 附非轴对齐示例 | cb47948 |
| V2-03 | pick `[[x,y]]` 兼容 + node/material id 归属（同帧 id pass）+ camera/shading 对齐 | 1c221b9, 4271c6b |
| V2-04 | E_PAYLOAD_TOO_LARGE 携带 {bytes,limit,tip}，交叉引用 status.limits | 19765ab |
| V2-05 | camera.project / camera.unproject 投影 API（golden 7 锚点 ≤1px）+ demo 脚本 | 44abbbc, 1f8b16e |
| V2-06 | mesh.tube 两点=任意方向直线圆柱写入 help/spec，端点重合用例 | cb47948 |
| V2-07a | cylinder radius_top=0 锥体用法 help 示例 | cb47948 |
| V2-07b | torus/capsule 几何全链路（protocol→bake→editor→specs） | b06c84e |
| V2-08a | 材质响应回读最终参数（preset 归一后） | 5d59306 |
| V2-08b | camera.set/save 接受 lens_mm（36mm 传感器换算），暴露 fov_h | d55d249 |
| V2-09 | node.id 覆盖语义 + upsert_by_name 幂等重建 | op-id-assign / handlers 测试覆盖 |
| V2-10 | 全局约定块（长度/角度/fov/像素坐标/颜色空间/世界系）常驻 status 与 help 首页 | e1ea39d |
| V2-11 | room.list name_prefix/updated_before 过滤 + total；room.close 批量 ids | 3d567f1 |
| V2-12 | daemon 渲染空闲 CPU 降低 | 58a681f |
| V2-13 | 错误契约统一 {code,message,hint,example,doc_ref} + snake_case 几何别名 | 19765ab |
| V2-14 | render.assert 视觉验收 op：串 project+pick，输出 pass/fail、误差 px、ΔE（7 锚点 fixture） | 2b829ef |
| V2-15 | apply_ops 事务语义 + dry_run 预检 + 部分成功返回 | apply-ops-feedback / apply-ops-summary 测试覆盖 |

## 配套修正（本次收口）

- 能力计数：新增 `render.assert` 后 registry = **73**；`capabilities/test/spec.test.ts` 断言 72→73。
- 文档 `agent/docs/vibe3d/vibe3d-packages.md` §1.2 能力表补 `render.assert` 行，计数文案 70→73；`registry-parity` 门禁恢复绿。
- 版本：8 包 0.1.0 → **0.2.0**，新增 CHANGELOG 0.2.0 段。
