# OpenCode2 → AG-UI event mapping

The adapter owns the AG-UI run lifecycle. OpenCode lifecycle events are signals, not events that are forwarded unchanged.

| OpenCode2 event | AG-UI output |
| --- | --- |
| incoming `RunAgentInput` | `RUN_STARTED` |
| `message.updated` (assistant) | create message correlation |
| `message.part.updated` (`text`) | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, optionally `TEXT_MESSAGE_END` |
| `message.part.delta` (`field=text`) | `TEXT_MESSAGE_CONTENT` |
| tool pending/running | `TOOL_CALL_START`, `TOOL_CALL_ARGS` |
| tool completed | `TOOL_CALL_END`, `TOOL_CALL_RESULT` |
| reasoning part | `REASONING_*` lifecycle |
| step start/finish | `STEP_STARTED`, `STEP_FINISHED` |
| subtask/task tool | `CUSTOM subagent.*` |
| `session.error` | `RUN_ERROR`, close SSE |
| `session.status=idle` / `session.idle` | close open events, `RUN_FINISHED`, close SSE |

Metadata-only content events without an actual `delta`, `text`, or `content` field are ignored. This prevents invalid AG-UI `TEXT_MESSAGE_CONTENT` events.

