# 生成式 UI 事件契约

本项目只借鉴参考仓库的 AG-UI activity 事件封装，不引入 A2UI 协议、组件树、Java Gateway、报告计算器或 browser-owned tool 的挂起恢复机制。卡片由当前 Vue 前端实现。

## 生产入口与职责

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

文件地址只接受现有同源 `/dataagent/web/api/agui/file/{UUID}` 路由，不接受外部 URL、脚本协议或任意本地路径。

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
