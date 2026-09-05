# Sub-Agent Presentation Contract

The current Element Plus X + AG-UI frontend presents child-agent work inside the parent conversation process. It does not create a second nested AG-UI run for each sub-agent and it does not depend on the retired `workspace.agents` / `ui.agentGraph` demo catalog.

## Runtime event

The adapter emits sub-agent state as the standard AG-UI activity event with the Data Agent activity type `dataagent.subagent`:

```json
{
  "type": "ACTIVITY_SNAPSHOT",
  "messageId": "subagent-sql-agent",
  "activityType": "dataagent.subagent",
  "content": {
    "agentId": "sql-agent",
    "name": "SQL Agent",
    "parentAgentId": "orchestrator",
    "task": "查询最近 30 天销售趋势",
    "status": "running"
  }
}
```

`content.status` uses `queued`, `running`, `completed`, or `failed` (the renderer also tolerates the equivalent terminal values `success` and `error`). Native tool execution still uses the standard `TOOL_CALL_*` lifecycle.

## Presentation rules

- Keep one outer `RUN_STARTED` / `RUN_FINISHED` lifecycle for the user turn.
- Do not synthesize nested AG-UI runs for child agents.
- `buildPresentation()` may suppress a `dataagent.subagent` activity when the same work is already represented by a matching tool call id / agent id, avoiding duplicate rows.
- An unmatched `dataagent.subagent` activity must remain visible and show the agent name, task, and status in the process flow.
- Top-level session navigation contains only root OpenCode sessions. Child sessions identified by `parentID` are execution details of their parent conversation, not independent sidebar conversations.

A richer graph/timeline view is a separate product capability and must be designed independently if it becomes a priority; it is not part of the current conversation UI contract.
