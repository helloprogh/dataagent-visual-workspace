# 界面接口契约

## 唯一前端接口

浏览器只依赖一个标准 AG-UI SSE 入口：

```text
CopilotChat
  POST /api/agui (Vite proxy)
    → POST /agent
      → OpenCode2 session / event / prompt / permission
      → dynamic frontend MCP
    ← standard AG-UI SSE
```

前端不请求 Adapter 的会话映射、上下文、权限、健康检查或 capability 接口。`threadId → OpenCode2 sessionID`、权限请求 ID 和 MCP 注册都由 Adapter 内部维护。

## 普通运行

`POST /agent` 接收标准 `RunAgentInput`，Adapter 在提交 OpenCode2 prompt 的同时消费原生事件流，并持续返回 AG-UI SSE：

- 文本：`TEXT_MESSAGE_START / CONTENT / END`
- 思考：`REASONING_*`
- 步骤：`STEP_STARTED / STEP_FINISHED`
- 工具：`TOOL_CALL_*`
- 状态：`STATE_SNAPSHOT`、`ACTIVITY_SNAPSHOT`
- 终态：`RUN_FINISHED` 或 `RUN_ERROR`

同一个 `threadId` 始终复用同一个 OpenCode2 session；映射、待处理 interrupt 与最近一次 resume 回执持久化在 Adapter 内部，不暴露给浏览器。

## 人工授权：Interrupt / Resume

OpenCode2 发出 `permission.asked` 时，Adapter 关闭当前仍活动的消息、工具和步骤生命周期，并通过同一条 SSE 输出：

```json
{
  "type": "RUN_FINISHED",
  "threadId": "thread-1",
  "runId": "run-1",
  "outcome": {
    "type": "interrupt",
    "interrupts": [{
      "id": "permission-1",
      "reason": "tool_call",
      "toolCallId": "tool-1",
      "message": "工具 shell 请求人工授权。",
      "responseSchema": {
        "type": "object",
        "properties": {
          "decision": {
            "type": "string",
            "enum": ["once", "always", "reject"]
          }
        },
        "required": ["decision"]
      }
    }]
  }
}
```

界面从 AG-UI client 的 `pendingInterrupts` 读取这些数据，并在输入框上方显示授权卡片。用户完成所有待处理决定后，界面仍调用 `POST /agent`：

```json
{
  "threadId": "thread-1",
  "runId": "run-2",
  "resume": [{
    "interruptId": "permission-1",
    "status": "resolved",
    "payload": { "decision": "once" }
  }]
}
```

Adapter 校验 resume 覆盖全部待处理 interrupt，再调用 OpenCode2 permission reply 并继续原 session。恢复后的工具结果使用原 `toolCallId`，不会重复发送 `TOOL_CALL_START / ARGS / END`。存在待处理 interrupt 时，缺少 `resume` 的新输入会返回 `RUN_ERROR`；完全相同的 resume 重试由持久化回执安全去重。

## 前端工具与生成式工作区

前端通过 `RunAgentInput.tools` 注册 `workspace.render/upsert/remove/agents`。Adapter 将这些工具注册为内部动态 MCP；OpenCode2 调用后，Adapter 输出标准 `TOOL_CALL_*`，浏览器执行 handler，再通过标准 `ToolMessage` 和同一个 `/agent` 入口续跑。

工作区状态通过 `RunAgentInput.state` 与 `STATE_SNAPSHOT` 同步。任务和子 Agent 状态通过 `ACTIVITY_SNAPSHOT` 同步，不需要额外 HTTP 接口。

## 开发入口

以下入口仅用于 Adapter 测试，不是生产前端依赖：

| 接口 | 用途 |
| --- | --- |
| `POST /agui/mock` | 不连接 OpenCode2 的标准 AG-UI mock |
| `POST /agui/replay` | 重放捕获的 OpenCode2 原生事件 |
