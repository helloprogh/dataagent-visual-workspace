# OpenCode2 → AG-UI 事件转换

Adapter 负责完整的 AG-UI run 生命周期。OpenCode2 原生事件不会原样透传，而是根据 `sessionID` 过滤、关联 message/tool/step，并重建标准 AG-UI 事件。

| OpenCode2 v2 原生事件 | AG-UI 输出 |
| --- | --- |
| 收到 `RunAgentInput` | `RUN_STARTED` |
| `session.inbox.enqueued/delivered` | `CUSTOM task.status(queued/delivered)` |
| `session.execution.started` | `CUSTOM task.status(running)` |
| `session.step.started/ended` | 同名配对的 `STEP_STARTED / STEP_FINISHED` |
| `session.text.started/delta/ended` | `TEXT_MESSAGE_START / CONTENT / END` |
| `session.reasoning.started/delta/ended` | `REASONING_START / MESSAGE_* / END` |
| `session.tool.input.* / called` | `TOOL_CALL_START / ARGS` |
| `session.tool.progress` | `CUSTOM tool.progress`；task 类工具为 `subagent.progress` |
| `session.tool.success/failed` | `TOOL_CALL_END / RESULT`；task 类工具补充 `subagent.completed/failed` |
| `permission.asked` | `CUSTOM task.status(waiting_permission)` + 界面提示 |
| `session.retry.scheduled` | `CUSTOM task.status(retry)` |
| `session.execution.succeeded` / `session.status=idle` | 关闭未完成事件，输出 `RUN_FINISHED` |
| `session.execution.failed/interrupted` | 关闭未完成事件，输出 `RUN_ERROR` |

关键约束：

- `REASONING_START`、`REASONING_END` 与 `REASONING_MESSAGE_*` 使用同一个 `messageId`，reasoning 消息角色为 `reasoning`。
- `STEP_STARTED` 与 `STEP_FINISHED` 使用同一个 `stepName`。
- OpenCode2 终态文本是完整值；如果此前已收到 delta，Adapter 只用终态事件关闭消息，避免重复内容。
- Adapter 先建立 `/api/event` 订阅，再调用 `/api/session/:id/prompt`，避免丢失快速事件。
- 下一条预取事件的 abort rejection 会被主动消费，Adapter 不会在 run 完成后因未处理的取消而退出。
- 旧版 `message.part.*` 事件仍保留兼容转换，便于 fixture replay。
