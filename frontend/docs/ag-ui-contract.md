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
  "context": [{
    "description": "A2UI catalog capabilities: available catalog IDs and components the client can render.",
    "value": "{...catalog metadata...}"
  }],
  "forwardedProps": { "a2uiCatalogAvailable": true }
}
```

`threadId` is the OpenCode session id and is stable for the lifetime of a conversation.

The A2UI capability fields are the only generative-UI additions. An A2UI component action starts a continuation run with `forwardedProps.a2uiAction`; it does not create a synthetic user message.

Chat runs use the AG-UI SSE endpoint. Session lifecycle and history use the
gateway endpoints documented below; the browser never calls OpenCode directly.

## Human approval

When `RUN_FINISHED.outcome.type` is `interrupt`, the client reads the standard `interrupts` array from `@ag-ui/client`. The chat renders the approval card immediately above the input. Once every interrupt has a decision, it calls the same agent with `runAgent({ resume })`; no side-channel permission API is used.

While interrupts are pending, normal chat input is blocked. A resumed tool emits only `TOOL_CALL_RESULT` for the original `toolCallId`, preserving the two-run AG-UI audit trail.

A2UI remains non-blocking presentation. Document delivery approval continues to use the standard `RUN_FINISHED.outcome.interrupts` and `runAgent({ resume })` path; retired A2UI confirmation actions are quarantined and never treated as approval decisions.

The Adapter persists server-side interrupt correlation inside its existing
thread/session registry. Interrupt restoration is separate from message-history
hydration because the OpenCode message endpoint does not expose the active AG-UI
interrupt outcome.

## Generative UI and workspace files

The current shell uses `@ag-ui/client` directly. Each run advertises the
versioned A2UI catalog through `forwardedProps.a2uiCatalogAvailable` and the
`context` catalog description. The Adapter then exposes the validated
`render_a2ui` MCP tool to the reference OpenCode2 service and converts its
result into an `a2ui-surface` activity. A2UI actions start a continuation run;
they never become approval decisions.

The Adapter still accepts `RunAgentInput.tools` for compatibility with clients
that provide browser-owned tools, but this frontend does not silently register
the old `workspace.*` catalog. Native OpenCode `write` results are projected
into file cards and use the safe `workspace-file` route; ZIP delivery cards use
`workspace-archive` and the right-side archive tree preview.

The active conversation id is persisted separately, so a page reload returns to
the same AG-UI `threadId` instead of switching to whichever background
conversation was updated most recently. A2UI snapshots and file cards remain
conversation-scoped and are restored from server history without allowing a
late run to overwrite the active conversation.

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
