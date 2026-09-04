# OpenCode2 → AG-UI 事件转换

Adapter 负责完整的 AG-UI run 生命周期。OpenCode2 原生事件不会原样透传，而是根据 `sessionID` 过滤、关联 message/tool/step，并重建标准 AG-UI 事件。

| OpenCode2 v2 原生事件 | AG-UI 输出 |
| --- | --- |
| 收到 `RunAgentInput` | `RUN_STARTED` + `STATE_SNAPSHOT` |
| `session.inbox.enqueued/delivered` | `ACTIVITY_SNAPSHOT`（queued/delivered） |
| `session.execution.started` | `ACTIVITY_SNAPSHOT`（running） |
| `session.step.started/ended` | 同名配对的 `STEP_STARTED / STEP_FINISHED` |
| `session.text.started/delta/ended` | `TEXT_MESSAGE_START / CONTENT / END` |
| `session.reasoning.started/delta/ended` | `REASONING_START / MESSAGE_* / END` |
| `session.tool.input.* / called` | `TOOL_CALL_START / ARGS` |
| `session.tool.progress` | `ACTIVITY_SNAPSHOT`；task 类工具携带子 Agent 活动信息 |
| `session.tool.success/failed` | `TOOL_CALL_END / RESULT` + `ACTIVITY_SNAPSHOT` |
| `permission.asked` | `ACTIVITY_SNAPSHOT`（waiting_permission）+ `RUN_FINISHED.outcome.interrupts` |
| `session.retry.scheduled` | `ACTIVITY_SNAPSHOT`（retry） |
| `session.execution.succeeded` / `session.status=idle` | 关闭未完成事件，输出 `RUN_FINISHED` |
| `session.execution.failed/interrupted` | 关闭未完成事件，输出 `RUN_ERROR` |

关键约束：

- `REASONING_START`、`REASONING_END` 与 `REASONING_MESSAGE_*` 使用同一个 reasoning `messageId`；reasoning 与最终 assistant text 必须使用不同的 `messageId`，reasoning 消息角色为 `reasoning`。
- `STEP_STARTED` 与 `STEP_FINISHED` 使用同一个 `stepName`。
- 当前端工具暂停一次 Run 时，Adapter 会先关闭仍活动的 OpenCode step，再发送 `RUN_FINISHED`，满足 AG-UI 的事件配对约束。
- OpenCode2 工具授权使用标准 AG-UI Interrupt/Resume：授权卡片只读取 `RUN_FINISHED.outcome.interrupts`，决定只通过下一次 `RunAgentInput.resume` 回传；没有自定义授权接口。
- 恢复运行只发送原 `toolCallId` 的 `TOOL_CALL_RESULT`，不重复发送已在中断前完成的工具调用开始、参数和结束事件。
- OpenCode2 终态文本是完整值；如果此前已收到 delta，Adapter 只用终态事件关闭消息，避免重复内容。
- Adapter 先建立 `/api/event` 订阅，再调用 `/api/session/:id/prompt`，避免丢失快速事件。
- 调用方提供的 `RunAgentInput.tools` 会被注册到名为 `agui_frontend` 的动态 MCP 服务；当前 AgentChat 主要通过 A2UI catalog 使用 `render_a2ui` MCP，不自动注册旧版 `workspace.*` 工具。
- A2UI `render_a2ui` 调用经过 catalog、组件图和 payload 校验后转换为 `a2ui-surface` activity；普通 A2UI action 才能发起续跑，不能代替审批。
- Workspace 文件通过原生 `write` 工具结果投影为 `workspace-file` 文件卡；结构化 ZIP 使用 `workspace-archive` 目录/文件预览。
- Workspace 状态如由兼容客户端提供，仍可通过 `RunAgentInput.state` 和 `STATE_SNAPSHOT` 同步，不依赖静态场景注入。
- `STEP_FINISHED` 只会在当前 AG-UI Run 已发出配对的 `STEP_STARTED` 时产生；续跑阶段迟到或重复的 OpenCode 步骤结束事件会被忽略。
- 已关闭的 reasoning 生命周期忽略迟到的重复 delta/ended 事件，避免界面连续出现空的思考卡片。
- legacy `message.part.*` reasoning 会派生独立的 `*-reasoning` message id，避免与同一 assistant 的最终文本发生 AG-UI message id 冲突。
- 下一条预取事件的 abort rejection 会被主动消费，Adapter 不会在 run 完成后因未处理的取消而退出。
- 旧版 `message.part.*` 事件仍保留兼容转换，便于 fixture replay。
