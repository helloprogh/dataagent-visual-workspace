# DataAgent 五阶段生成式 UI 验收报告

> 验收日期：2026-09-05
>
> 验收会话：`ses_f9158b050ffe4QuA6LjYgKz39Q`
>
> 联调链路：Vue 前端 `5173` → Adapter `3001` → 参考 OpenCode `opencode-dataagent-v2` `4096`

## 1. 验收目标

以一条真实 AG-UI 会话完成 `Specification → Solution Design → Development → Validation → Release` 五阶段数据开发流程。每一阶段必须先展示结构化产物，再由原生审批中断控制是否继续；文件卡和右侧预览均可完成审批。开发阶段必须生成可浏览目录并打开内部文件的 ZIP，最终审批后才允许显示“已发布”。

## 2. 实际结果

| 阶段 | 主要产物 | 预览 | 审批与推进 | 结果 |
| --- | --- | --- | --- | --- |
| Specification | `analysis-spec.json`、`source-manifest.json` | JSON 可读 | 从右侧预览确认后进入 Design | 通过 |
| Solution Design | 设计说明、数据字典、Schema、质量规则、审批记录 | Markdown/JSON 可读 | 从对话卡确认后进入 Development | 通过 |
| Development | 执行计划、SQL、指标契约、治理策略、样例数据、`data-development-delivery.zip` | ZIP 展示完整树，包内 SQL 可读 | 从右侧预览确认后进入 Validation | 通过 |
| Validation | 执行证据、验证报告、发布审批记录 | Markdown/JSON 可读 | 从对话卡确认后进入 Release | 通过 |
| Release | `05-release/v1/README.md`、`manifest.json` | Markdown/JSON 可读 | 最终确认后显示“已发布” | 通过 |

最终界面统计为 18 个真实交付物。最终 ZIP 包含 `data-applications/demo-sales/` 下五阶段完整目录，不包含临时 `PENDING.md`；包内 `transform.sql` 已在右侧预览中打开并核对。审批等待状态在 Adapter 重启和页面刷新后能够从真实会话恢复。

## 3. 验收中发现并修复的问题

1. **Shell 生成的 ZIP 没有文件卡**：此前只投影原生 `write` 工具。现在对成功的 `shell/bash` 压缩命令提取显式 ZIP 路径，生成 `workspace-archive` 卡片，并按规范化路径去重。
2. **临时文件删除后仍被统计**：现在识别成功的 `Remove-Item`，按源路径撤销已投影卡片，避免已不存在的文件仍可点击。交付物统计由 20 回落到真实的 18。
3. **模型可能在最终审批前写入已发布**：Adapter 的可信运行上下文新增硬门禁约束；审批前只能使用待审批/待发布状态，确认恢复后才可更新 canonical 状态并宣布发布，取消必须终止流程。
4. **取消入口与多中断约束不一致**：文件卡和生成式 UI 卡均提供取消；存在多个待审批中断时，确认与取消都必须走汇总表单，禁止只处理部分中断。

## 4. 交互不变量

- 审批卡不是交付物，不参与右上角数量统计。
- A2UI 负责受限组件展示和普通 action，原生 form/permission interrupt 才拥有审批权。
- 文件卡与右侧预览复用相同的 `ResumeEntry` 构造和 schema 校验。
- 阶段推进来自后端 resume 后的真实事件，前端不硬编码完成或发布状态。
- 历史水合、刷新和服务重启后，待审批状态与产物卡仍需保持一致。

## 5. 自动化验证

- 生成式 UI、A2UI、文件投影、硬门禁与样式约束测试。
- 前端 TypeScript/Vue 类型检查。
- 前后端完整测试与生产构建。
- 前端离线构建检查及 `git diff --check`。

详细设计见 [技术路线说明](./technical-route.md)、[对话流与人机交互说明](./conversation-flow.md) 和 [生成式 UI 事件契约](./generative-ui-events.md)。
