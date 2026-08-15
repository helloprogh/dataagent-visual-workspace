# 界面使用的接口清单

## 1. 总体链路

```text
CopilotChat
  POST /api/agui (Vite proxy)
    → POST /agent 或 /agui/hybrid
      → RunAgentInput.tools 注册到 agui_frontend MCP
      → POST /api/session
      → GET  /api/event
      → POST /api/session/:sessionID/prompt
      ← OpenCode2 native events
      → TOOL_CALL_* → 浏览器工具 → ToolMessage → MCP result
    ← standard AG-UI SSE
```

Adapter 在提交 OpenCode2 `prompt` 的同时消费事件流；界面侧的 `/agent` 是持续到当前运行暂停或完成的 AG-UI SSE 请求。因此界面既能看到异步任务状态，又能获得标准、完整的 AG-UI run。

## 2. 主 Agent

| 界面接口 | OpenCode2 接口 | 说明 |
| --- | --- | --- |
| `POST /agent` | `POST /api/session` | thread 首次运行时创建主 Agent 会话 |
| `POST /agent` | `POST /api/session/:sessionID/prompt` | 提交最新 user message，并发消费事件流 |
| `POST /agent` | `GET /api/event` | 接收文本、思考、步骤、工具、执行状态 |

同一个 `threadId` 始终复用同一个 OpenCode2 `sessionID`。

## 3. 子 Agent 与工具调用

子 Agent 是 OpenCode2 `task`、`subtask`、`agent`、`delegate` 工具调用的语义扩展，不需要额外 HTTP run 接口。

| OpenCode2 事件 | 界面事件 |
| --- | --- |
| `session.tool.input.started/delta/ended` | `TOOL_CALL_START / TOOL_CALL_ARGS` |
| `session.tool.called/progress` | 工具执行中；task 类工具输出 `ACTIVITY_SNAPSHOT` |
| `session.tool.success/failed` | `TOOL_CALL_END / TOOL_CALL_RESULT` + 子 Agent Activity 终态 |

前端用 `useFrontendTool` 注册 `workspace.render/upsert/remove/agents`。这些 schema 随 `RunAgentInput.tools` 下发，Adapter 动态注册为 OpenCode2 MCP 工具。工具在浏览器执行后以标准 `ToolMessage` 返回，Adapter 解析等待中的 MCP 调用并续跑原会话。

工作区 widget schema 按 `component` 区分并携带真实 props 结构；schema 变化时 Adapter 会重新连接动态 MCP 以刷新 OpenCode2 catalog。图表组件兼容常见 Chart.js 输入并转换为本项目的 `points/items` 数据结构。

## 4. 思考过程

`GET /api/event` 中的 `session.reasoning.started/delta/ended` 转换为标准 `REASONING_*` 事件。模型不提供 reasoning 时，界面不会伪造真实思考内容；已经结束的 reasoning 会忽略迟到重复事件。

## 5. 同步 / 异步任务状态

| 界面接口 | OpenCode2 接口 | 用途 |
| --- | --- | --- |
| `POST /agent` | `POST /api/session/:sessionID/prompt` | 状态通过同一 AG-UI SSE 返回 |
| `GET /debug/sessions` | `GET /api/session/:sessionID/inbox` | 查看当前排队数量 |
| `POST /debug/sessions/:threadId/background` | `POST /api/session/:sessionID/background` | 把可后台化的阻塞工具转入后台观察 |
| `POST /debug/sessions/:threadId/interrupt` | `POST /api/session/:sessionID/interrupt` | 终止当前执行 |

界面状态包括 `queued`、`delivered`、`running`、`retry`、`waiting_permission`、`completed` 和错误/中断，统一使用 `ACTIVITY_SNAPSHOT`。

## 6. 工具授权

| 界面接口 | OpenCode2 接口 | 用途 |
| --- | --- | --- |
| `GET /debug/sessions` | `GET /api/session/:sessionID/permission` | 获取待处理授权 |
| `POST /debug/sessions/:threadId/permissions/:requestId/reply` | `POST /api/session/:sessionID/permission/:requestID/reply` | `once` / `always` / `reject` |

## 7. 上下文

`GET /debug/sessions/:threadId/context` 转换为 `GET /api/session/:sessionID/context`，返回最近一次 compaction 之后的活动上下文。OpenCode2 session 本身保存历史，因此 Adapter 只提交当前最新用户消息，不重复发送整段聊天历史。

当前 workspace 还会通过标准 `RunAgentInput.state` 下发，并由 `STATE_SNAPSHOT` 回送，保证刷新、切换会话和工具续跑时界面状态一致。

## 8. 会话切换

前端本地会话切换会改变 CopilotKit `threadId`。Adapter 使用 `adapter/.data/thread-sessions.json` 持久化 `threadId → sessionID`：

- 新 thread：创建新 OpenCode2 session；
- 切回旧 thread：复用原 session 与上下文；
- Adapter 重启：恢复映射；
- 上游 session 已删除：自动清理失效映射并重建。

`GET /debug/sessions` 用于联调面板显示所有已映射会话，但不会暴露 OpenCode2 service 密码。

## 9. 协议与场景调试

| 接口 | 用途 |
| --- | --- |
| `GET /health` | Adapter 与 OpenCode2 健康状态 |
| `GET /debug/capabilities` | 连接、版本、支持场景、接口目录与事件映射 |
| `POST /agui/hybrid` | `/agent` 兼容别名，不注入固定场景 |
| `POST /agui/mock` | 不连接 OpenCode2 的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的 OpenCode2 原生事件 |
| `/opencode/*` | 自动补本机认证的 OpenCode2 `/api` 透传 |
