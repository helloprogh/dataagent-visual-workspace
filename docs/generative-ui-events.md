# 生成式 UI 事件契约

本项目同时支持两种生成式 UI activity：原有应用卡片 `dataagent.ui`，以及 `dataagent-master` 后端的 A2UI v0.9 `a2ui-surface`。A2UI 使用官方 `@a2ui/web_core` 消费声明式组件树；前端只注册白名单组件，不执行模型提供的 HTML、JavaScript、Vue 模板或任意 ECharts option。

## dataagent-master A2UI v0.9

后端通过标准 AG-UI `ACTIVITY_SNAPSHOT` 发送完整操作历史：

```json
{
  "type": "ACTIVITY_SNAPSHOT",
  "threadId": "thread-example",
  "runId": "run-example",
  "messageId": "a2ui-sales--run-example",
  "activityType": "a2ui-surface",
  "replace": true,
  "content": {
    "a2ui_operations": [
      { "version": "v0.9", "createSurface": { "surfaceId": "sales", "catalogId": "https://opencode-agui-app.local/a2ui/data-agent-catalog.json" } },
      { "version": "v0.9", "updateComponents": { "surfaceId": "sales", "components": [] } },
      { "version": "v0.9", "updateDataModel": { "surfaceId": "sales", "path": "/", "value": {} } }
    ]
  }
}
```

支持 `createSurface`、`updateComponents`、`updateDataModel` 和 `deleteSurface`，并兼容同版本的旧字段名 `beginRendering`、`surfaceUpdate`、`dataModelUpdate`。每个请求通过 `RunAgentInput.context` 声明 DataAgent catalog，通过 `forwardedProps.a2uiCatalogAvailable = true` 告知 Gateway 可以调用 `render_a2ui`。

组件 action 由 A2UI runtime 解析数据绑定后产生，前端不把它伪造成用户消息，而是用新的 Agent run 通过 `forwardedProps.a2uiAction` 原样回传。后端收到的结构包含 `name`、`surfaceId`、`sourceComponentId`、`timestamp` 和解析后的 `context`。

当前 Node Adapter 在客户端同时声明 A2UI context 与 `a2uiCatalogAvailable` 时，会向本次 OpenCode workspace 注册服务端 `render_a2ui` MCP 工具。工具参数在 Adapter 端再次经过组件白名单、root、引用完整性、循环、深度和大小校验；成功调用被转换为与 `dataagent-master` 相同的 `a2ui-surface` v0.9 snapshot，并按 surfaceId 跨 run 复用 activity messageId。`forwardedProps.a2uiAction` 会转换成 `A2UI_ACTION` Agent prompt，要求需要改变界面时使用相同 surfaceId 再次调用 `render_a2ui`。

安全边界与 `dataagent-master` 一致：A2UI 仅负责非阻塞展示和普通交互，不能承担审批。`request_user_confirm`、`hitl_confirm`、`hitl_cancel` 等旧审批 action 会被隔离；文档交付确认继续使用标准 AG-UI interrupt/`resume`，文档预览面板不会把 A2UI action 当作审批决定。

当前白名单与后端 `a2ui-delivery-contract.json` 对齐，包括基础布局、媒体、表单组件，以及 `MetricCard`、`DataTable`、`BarChart`、`LineChart`、`PieChart`、`InsightCard`、`WarningCard`、`ActionButton`、`Badge`、`Markdown`。

下文保留原有 `dataagent.ui` 卡片契约，供现有 Adapter 与历史会话兼容。

## 原有 dataagent.ui 入口与职责

- 上游可发送 `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA`，`activityType` 必须是 `dataagent.ui`。携带当前 `threadId`、`runId`；snapshot 首次需指定真实原生 assistant 消息的 `parentMessageId`，用于分页历史恢复。
- 已有工具也可以在成功结果中返回 `{ "dataagentUi": <下述 content> }`，包括 MCP 文本结果中的 JSON。Adapter 将显式结果投影为快照，同时保留真实 tool result；不根据工具名称、正文文字或未完成参数猜测卡片。
- 这次没有新增模型工具、提示词执行流程或模型端生成能力。普通模型文本不会自动变成卡片；生产者需要按此契约发送数据。
- 不执行模型提供的 HTML、JS、Vue 模板或任意按钮 action。审批仍使用原有 AG-UI interrupt，文件预览仍使用现有预览面板。

## 创建 / 替换快照

以下数据仅为协议示例，不是真实业务结果：

```json
{
  "type": "ACTIVITY_SNAPSHOT",
  "threadId": "ses-example",
  "runId": "run-example",
  "parentMessageId": "msg-example",
  "activityType": "dataagent.ui",
  "content": {
    "version": 1,
    "surfaceId": "sales",
    "title": "销售概览",
    "summary": "按区域汇总",
    "status": "generating",
    "cards": []
  },
  "replace": true
}
```

Adapter 统一生成 `messageId = ui-${runId}-${surfaceId}`，并始终输出完整、校验后的快照和 `replace: true`。同轮同 surface 原位更新；不同 run 独立消息，保留历史版本。重复快照不重复显示。

## 增量更新

```json
{
  "type": "ACTIVITY_DELTA",
  "threadId": "ses-example",
  "runId": "run-example",
  "messageId": "ui-run-example-sales",
  "activityType": "dataagent.ui",
  "patch": [
    { "op": "replace", "path": "/cards", "value": [
      { "id": "sales-total", "kind": "metrics", "items": [
        { "label": "销售额", "value": 1200, "detail": "协议示例数据" }
      ] }
    ] },
    { "op": "replace", "path": "/status", "value": "ready" }
  ]
}
```

只支持 `add` / `replace` 对 `/title`、`/summary`、`/status`、`/cards` 整字段更新。首次必须先发 snapshot，未知消息的 delta 不创建隐式卡片；不允许补丁修改身份字段或任意对象路径。

状态：`generating`（生成中）、`ready`（已生成）、`error`（失败但可保留部分内容）、`removed`（移除并保留恢复所需的终态）。正常结束/失败时仍停留在 generating 的卡片会标为未完成，而不是伪造成功。

## 卡片数据

所有卡片含唯一 `id`、`kind` 和可选 `title`。

| kind | 其余字段 | 显示 |
| --- | --- | --- |
| text | `text` | 纯文本 |
| markdown | `text` | 已启用 sanitize 的 Markdown |
| metrics | `items: [{label, value, detail?}]` | 自适应指标卡 |
| table | `columns: [{key,label}], rows: [{字段:标量}]` | 可滚动表格 |
| file | `name, url, mimeType?, approvalMode?` | 文件卡，点击复用右侧预览；可发起交付确认 |

由 `dataagent.ui` 生产的文件卡地址只接受现有同源 `/dataagent/web/api/agui/file/{UUID}`、`workspace-file` 或 `workspace-archive` 路由，不接受外部 URL、脚本协议或任意本地路径。工作区地址只能携带一个安全的相对 `path` 查询参数；Adapter 会再次把路径限制在当前工作区内。对于 `dataagent-master` 生成的 Spec，前端还会把成功的 `write` 工具结果投影为对话内文件卡。

开发阶段的结构化 ZIP 产物使用同源 `/dataagent/web/api/agui/workspace-archive?path=...` 预览：不带 `entry` 返回受限的目录清单，带 `entry` 返回压缩包内单个文件内容。Adapter 只接受安全相对路径、stored/deflate 算法，并限制压缩包、条目和单文件大小；前端右侧预览补齐隐含目录，支持 Markdown、文本、图片和 PDF 文件查看。

### Spec / 文件确认闭环

需要确认的生成文件在 file 卡中声明 `"approvalMode": "next-interrupt"`，随后由模型调用一次单字段表单；该字段的第一个选项必须是肯定操作（例如“确认并继续”），第二个选项可用于“需要修改”。Adapter 收到 `form.created` 后才取得真实表单 ID，并把它通过更新后的 UI 快照写入 `approvalInterruptId`。前端据此把同一中断同时绑定到：

- 对话卡片中的“确认并继续”；
- 点击卡片后右侧完整预览底部的“确认并继续”。

两处入口生成完全相同的 AG-UI resume entry，只能提交当前唯一待处理的审批。提交期间按钮禁用；提交成功后从后端历史重新对齐卡片和工具状态。刷新或 Adapter 重启时，快照与未处理表单分别恢复后再次按 ID 关联。

生产环境应由应用工具直接返回结构化 JSON。若在 Windows Shell 中调试事件，标准输出必须使用 UTF-8，或把非 ASCII 字符写成 JSON `\uXXXX` 转义；字节在进入事件流前已经被错误解码时，前端无法无损恢复标题文本。

绑定规则刻意保持严格：当前 Run 必须恰好存在一个尚未绑定、声明了 `next-interrupt` 的文件卡。零个或多个候选都不会猜测文件归属，表单会回退到对话输入区上方的通用审批界面。多字段、自由文本或没有明确选项的表单不会显示快捷确认，必须在完整审批界面处理。

限制：单快照最多 65536 个 JSON 字符、12 张卡、每组 24 个指标、每表 20 列/200 行；未知版本/类型、重复 ID、无效补丁会被拒绝。前端对不支持的快照显示格式错误提示，不执行数据中的代码。

## 对话与历史

- 使用同一套 SSE/AG-UI client 消息流，不增开 UI 连接，不中断当前模型执行。
- 卡片按对话轮次展示在回答区域末尾，不进入 thinking / 工具步骤的折叠区。生成中可以先出现；后续正文到达时卡片保持在该轮回答后。
- Adapter 保存每条 UI 消息的最新完整快照。历史 `/session/{id}/message` 在保持原 `data/cursor` 分页结构不变的前提下，增加 `activities` 字段，仅返回其 parent 在本页的卡片。前端按 parent 归位，再交给同一渲染器。
- `removed` 快照也保存，防止刷新后删除的卡片重新出现。

## 验证

`npm run check` 包含快照、补丁、会话隔离、工具结果投影、真实 AG-UI client 消费和历史恢复测试。

开发态访问 `/tests/generative-ui.html` 可使用明确标注的模拟 SSE 验证真实前端组件。该页面不调用模型，不写入会话，也不作为生产入口或真实模型验收证据。
