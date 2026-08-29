# Standard AG-UI Contract

The frontend connects to an AG-UI compatible backend through the Data Agent
gateway via `@ag-ui/client` `HttpAgent`.

There is no CopilotRuntime. The browser creates and selects OpenCode sessions,
then uses the returned session id as the AG-UI thread id.

## RunAgentInput

No custom top-level properties are added:

```json
{
  "threadId": "thread-...",
  "runId": "...",
  "messages": [],
  "state": {},
  "tools": [],
  "context": [],
  "forwardedProps": {}
}
```

`threadId` is the OpenCode session id and is stable for the lifetime of a conversation.

Chat runs use the AG-UI SSE endpoint. Session lifecycle and history use the
gateway endpoints documented below; the browser never calls OpenCode directly.

## Human approval

When `RUN_FINISHED.outcome.type` is `interrupt`, the client reads the standard `interrupts` array from `@ag-ui/client`. The chat renders the approval card immediately above the input. Once every interrupt has a decision, it calls the same agent with `runAgent({ resume })`; no side-channel permission API is used.

While interrupts are pending, normal chat input is blocked. A resumed tool emits only `TOOL_CALL_RESULT` for the original `toolCallId`, preserving the two-run AG-UI audit trail.

The Adapter persists server-side interrupt correlation inside its existing
thread/session registry. Interrupt restoration is separate from message-history
hydration because the OpenCode message endpoint does not expose the active AG-UI
interrupt outcome.

## Frontend tools and workspace state

CopilotKit registers `workspace.render`, `workspace.upsert`, `workspace.remove`, and `workspace.agents` with `useFrontendTool`. Their schemas are sent in standard `RunAgentInput.tools`; the Adapter exposes them to OpenCode2 as a dynamic MCP server and maps native MCP tool calls back to AG-UI `TOOL_CALL_*` events.

`workspace.render/upsert` use a discriminated widget union: every `ui.*` component carries its actual props schema. For example, `ui.lineChart` uses `points: [{ label, value }]`. The workspace store also normalizes common Chart.js `data.labels/datasets` payloads for compatibility with models or sessions that retained an older tool catalog.

`ui.areaChart` uses the same `points: [{ label, value }]` series contract and renders a filled trend area. For compatibility with older browser state, serialized `workspace.widgets` JSON is parsed before persistence and rendering instead of being treated as an empty workspace.

On thread hydration, the dedicated per-thread workspace store is authoritative. A throttled conversation snapshot may lag behind the most recent frontend tool result and is therefore not allowed to overwrite the newer persisted workspace during page reload.

Shared workspace snapshots are applied monotonically by `updatedAt`; a delayed snapshot from an earlier AG-UI run cannot roll back a newer browser tool result.

The active conversation id is persisted separately, so a page reload returns to the same AG-UI `threadId` instead of switching to whichever background conversation was updated most recently.

After a browser handler runs, CopilotKit sends a standard `ToolMessage`. The Adapter resolves the pending MCP call and resumes the same OpenCode2 session. Workspace data is carried in `RunAgentInput.state` and synchronized by `STATE_SNAPSHOT`; task and sub-agent status use `ACTIVITY_SNAPSHOT`.

## Conversation persistence

The server is authoritative for conversation history:

- `GET /dataagent/web/api/session` returns `{ data: Session[] }`.
- `GET /dataagent/web/api/session/{sessionId}/message` returns
  `{ data: { info: Message, parts: Part[] }[] }`.

The list is loaded at application startup and when the history page is opened.
Messages are fetched lazily when a conversation becomes active and converted to
AG-UI `Message[]` before being injected into that thread's agent clone.

All OpenCode sessions are retained in the local repository. Only sessions
without `parentID` appear in the top-level conversation list; child sessions
remain associated through `parentID` for presentation as sub-agent execution
details inside their parent conversation.

`ConversationRepository` keeps a local cache for workspace state, optimistic
new-session metadata, and offline fallback. A history response updates cached
messages without changing the server-provided session order. Each hydration is
abortable and generation-checked so a late response from a previously selected
conversation cannot overwrite the active thread.
