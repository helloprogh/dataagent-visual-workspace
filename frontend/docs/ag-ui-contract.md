# Standard AG-UI Contract

The frontend connects to an AG-UI compatible backend through the Data Agent gateway via `@ag-ui/client` `HttpAgent`.

There is no Copilot Runtime. The browser uses the gateway's OpenCode session APIs for conversation lifecycle/history and uses the OpenCode session id as the AG-UI `threadId`.

## RunAgentInput

No custom top-level properties are added:

```json
{
  "threadId": "session-...",
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

The A2UI capability fields are the generative-UI additions. An A2UI component action starts a continuation run with `forwardedProps.a2uiAction`; it does not create a synthetic user message.

Chat runs use the AG-UI SSE endpoint. Session lifecycle and history use the gateway endpoints documented below; the browser never calls OpenCode directly.

## Human approval

When `RUN_FINISHED.outcome.type` is `interrupt`, the client reads the standard `interrupts` array from `@ag-ui/client`. The chat renders the matching response-schema UI and, once all required decisions are present, calls the same agent with `runAgent({ resume })`; no browser-side permission side channel is used.

While interrupts are pending, normal chat input is blocked. A resumed native tool can complete in the continuation run using its original `toolCallId`; after a successful resume the frontend refreshes authoritative message history so the cross-run tool state matches a reload.

A2UI remains non-blocking presentation. File/document delivery approval also uses standard `RUN_FINISHED.outcome.interrupts` and `runAgent({ resume })`. Retired A2UI confirmation actions are rejected and are never treated as approval decisions.

Interrupt restoration is separate from normal message hydration because the OpenCode message endpoint is not the authoritative source for an active AG-UI interrupt outcome. The frontend creates a hydration client with `mode=hydrate` when opening an existing session so pending interrupts can be reconstructed.

## Generative UI policy

### Canonical generic path: A2UI

A2UI (`activityType: a2ui-surface`) is the canonical path for new generic model-generated interfaces: metrics, tables, charts, markdown, badges, generic actions, and other catalog-defined surfaces.

Each run advertises the versioned A2UI catalog through `forwardedProps.a2uiCatalogAvailable` and the AG-UI `context` catalog description. The adapter exposes the validated `render_a2ui` capability to OpenCode and projects the result into an `ACTIVITY_SNAPSHOT` using `activityType: a2ui-surface`.

A persisted A2UI activity must be replayable as a snapshot. The adapter therefore publishes a surface snapshot containing `createSurface` plus its component/data updates (or a standalone `deleteSurface` when closing a surface). The browser sanitizes the operations against the allowed catalog before rendering them.

A2UI actions start another AG-UI run with `forwardedProps.a2uiAction`; approvals never use A2UI actions.

### Compatibility path: `dataagent.ui`

`activityType: dataagent.ui` remains readable for persisted history and existing file-delivery/approval behavior. `GenerativeUiCard.vue` is a compatibility renderer, not the extension point for new generic UI types.

Do not add new generic metric/table/chart/card kinds to `dataagent.ui`. New generic generated UI must use the A2UI catalog. Stable business-specific experiences may use explicit Vue components when they have a fixed domain contract.

## Workspace files and generated artifacts

The frontend does not silently register the retired browser-owned `workspace.*` tool catalog. Native OpenCode file-writing tool results are projected into generated artifact cards and use the safe `workspace-file` route. ZIP delivery cards use `workspace-archive` and the right-side archive tree preview.

Generated artifacts, input attachments, persisted `dataagent.ui` file cards, and pending approval ids are projected into a presentation-only deliverables model. This model is derived from AG-UI/history state and is not a second transport protocol.

## Sub-agent activities

Child-agent work stays inside the outer user run. The adapter emits `ACTIVITY_SNAPSHOT` with `activityType: dataagent.subagent`; the frontend renders unmatched activities inside the conversation process and suppresses a duplicate activity when a matching standard tool call already represents the same work. No nested `RUN_STARTED` / `RUN_FINISHED` lifecycle is synthesized for a sub-agent.

See `subagent-visualization.md` for the presentation contract.

## Conversation persistence

The server is authoritative for conversation history:

- `GET /dataagent/web/api/session` returns an OpenCode V2 session page wrapped by the gateway.
- `GET /dataagent/web/api/session/{sessionId}/message` returns OpenCode V2 message data wrapped by the gateway.

The session list is loaded at application startup. Messages are fetched lazily when a conversation becomes active and converted to AG-UI `Message[]` before they are injected into that thread's `HttpAgent`.

The frontend requests the newest message page first (`order=desc`) and reverses it for chronological chat presentation. Older pages are fetched by cursor and prepended while preserving scroll position.

Only sessions without `parentID` and without an archive timestamp appear in the top-level conversation list. Child sessions remain execution details associated with their parent conversation.

The active conversation id is stored separately in localStorage (`dataagent.conversations.active.v3`). Conversation messages are not treated as a localStorage source of truth. A late history response is generation-checked so a previously selected conversation cannot overwrite the currently active thread.

Conversation display-name aliases are currently local presentation state. Server-backed rename/archive/delete require a separately confirmed gateway API and are outside this contract.
