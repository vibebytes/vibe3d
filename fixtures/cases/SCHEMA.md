# fixtures/cases 契约用例格式（T09 输入契约）

同一份 JSON 对 **daemon（内存启动）** 与 **client mock** 跑同一套断言。格式固定，改格式等于改契约。

```jsonc
{
  "name": "apply-basic",          // 必填，等于文件名去扩展名
  "template": "empty",            // 可选，取 fixtures/docs/<name>.json；缺省 empty
  "steps": [
    {
      "call": "ops.apply",        // 必填，capabilities 里的能力名（runner 自己映射到 wire 名）
      "params": { },              // 可选，方法入参（roomId 由 runner 注入）
      "as": "a",                  // 可选，捕获本次返回值，供后续 $ 引用
      "expect": {                 // 可选，缺省表示「只要不抛错」
        "error": "E_CONFLICT",    // 断言抛错码；出现时其余断言不生效
        "assert": [               // 断言列表，全部通过才算过
          { "path": "doc.revision", "eq": 1 },
          { "path": "doc.roots", "len": 1 },
          { "path": "doc.nodes.n_00000001", "exists": true }
        ]
      }
    }
  ]
}
```

## 断言算子

| 算子 | 语义 |
| --- | --- |
| `eq` | 深等（对象/数组逐键比较，数字按 `===`） |
| `ne` | 深不相等 |
| `len` | 数组长度 / 对象键数 |
| `exists` | `true` 要求路径可解析且值不为 `undefined`；`false` 反之 |

## 路径与引用

- 路径用点号分段，数字段视为数组下标：`doc.camera.p.1`。
- 顶层可取：`doc`（当前文档快照）、`revision`、`applied`、`warnings`，以及方法返回值的任意字段。
- `$<key>` / `$<key>.<field>` 引用 `as` 捕获的步骤返回值；出现在 `params` 里会整棵展开：`"target": "$imp.nodeId"`。
- 断言路径里要「拿引用值当键」时用花括号，花括号内用 `:` 代替 `.`（路径本身按 `.` 分段）：`doc.nodes{imp:nodeId}.anim.playing`、`doc.assets{imp:sha}.kind`。
- 引用只解析「字符串整体以 `$` 开头」的情况，不做模板插值。

## 约束

1. **节点/材质 id 必须符合** `^n_[a-z0-9]{8}$` / `^m_[a-z0-9]{8}$`，用例里统一用 `n_00000001` 这类可读固定值。
2. **写用例不许依赖时序**：需要「上一批已生效」就串两个 step，不靠 sleep。
3. `conflict.json` 依赖 `ops.apply` 的可选入参 `baseRevision`（daemon 侧映射 `expectRevision`）。**当前 capabilities 未暴露该入参，属已知缺口，T09 补**；用例先按目标行为写（红）。
4. 资产类用例引用的文件相对 `fixtures/assets/`，由 `scripts/make-fixtures.mjs` 生成，sha 见 `fixtures/assets/PROVENANCE.json`。
