# Data Agent Conversation UI Architecture Improvement Design

**Status:** Approved for planning
**Date:** 2026-09-05
**Target branch:** `refactor/element-plus-x-agui-vite8`
**Scope:** `frontend/` conversation UI and its regression-test boundary

## 1. Context

The current Vue 3 + Element Plus X + `@ag-ui/client` implementation is functionally mature: it supports persisted sessions, history hydration, streaming text, reasoning, tool calls, stop/retry, model selection, attachments, HITL interrupts, artifact preview/approval, A2UI, Skills/Tools pages, theme switching, i18n, and responsive inspector panels.

The next problem is no longer missing surface functionality. The main risks are architectural concentration and regression confidence:

1. `frontend/src/features/conversation/components/AgentChat.vue` has become the orchestration center for too many unrelated concerns.
2. Generic generated UI exists in two parallel forms: legacy `dataagent.ui` and A2UI `a2ui-surface`.
3. Existing Playwright specs contain selectors, storage keys, and CopilotKit-era assumptions that no longer match the current implementation.
4. A few presentation/state inconsistencies remain, such as the user bubble not consuming its dedicated tokens and model-selection UI not rolling back after a failed backend switch.
5. The existing subagent visualization document describes `activityType: subagent`, while the current adapter emits `dataagent.subagent`; documentation and UI semantics must use the actual runtime contract.

This design deliberately improves those areas without changing the backend AG-UI protocol, adding a new state-management library, or rewriting the conversation feature from scratch.

## 2. Goals

### 2.1 Primary goals

- Make the current UI behavior verifiable through an up-to-date Playwright suite that is actually runnable from package scripts and CI/check workflows.
- Reduce `AgentChat.vue` to a page-level orchestrator by extracting independently testable presentation concerns.
- Keep `useAgentConversation()` as the AG-UI runtime boundary and keep raw AG-UI/OpenCode-derived messages separate from presentation models.
- Make A2UI the canonical generic generative-UI path while keeping `dataagent.ui` as compatibility-only during migration.
- Preserve all currently working conversation behavior while refactoring.
- Fix small state/presentation correctness issues discovered during the audit.
- Align subagent documentation and presentation behavior with the adapter's `dataagent.subagent` activity contract.

### 2.2 Success criteria

The change is complete when all of the following are true:

- `npm run typecheck -w frontend` passes.
- `npm run build -w frontend` passes.
- `npm run test:e2e -w frontend` passes.
- Root `npm run check` includes frontend E2E coverage or an explicitly named frontend regression command that CI runs.
- No new production dependency is added beyond the existing stack; `@playwright/test` may be added as a dev dependency if missing.
- Opening a session does not switch its backend model.
- A failed user-initiated model switch restores the previous visual selection.
- Stop, retry, history pagination, interrupt hydration/resume, file approval, A2UI rendering/action, theme switching, and lazy session creation are covered by current E2E tests.
- `AgentChat.vue` no longer owns deliverable derivation, scroll-state bookkeeping, inspector-panel state, and composer behavior directly.
- Generic new generated UI is documented and tested as A2UI-first; `dataagent.ui` remains readable for persisted/legacy activities but receives no new generic component types.
- Runtime subagent activity is documented as `dataagent.subagent` and no stale `subagent` contract remains in the frontend docs.

## 3. Non-goals

The following are intentionally outside this implementation plan and should get separate specs if required:

- Replacing Element Plus X.
- Replacing `@ag-ui/client` or changing AG-UI transport semantics.
- Introducing Pinia solely for conversation state.
- Rewriting the Java/Node adapter protocol.
- Removing legacy `dataagent.ui` persistence support in one step.
- Implementing a complete JSON Schema renderer for HITL.
- Server-backed conversation rename; current local alias behavior stays until a stable update API is confirmed.
- Upload progress protocol, resumable uploads, or parallel upload UX.
- Native XLSX/DOCX/PPTX/Parquet preview.
- A full agent graph/timeline workspace.
- New large business-specific cards such as SpecReviewCard or FilePackageReviewCard; this design only preserves a clean extension point for fixed Vue business cards.

## 4. Constraints

- Keep Vue 3, Element Plus, `vue-element-plus-x`, `@ag-ui/client`, `x-markdown-vue`, A2UI Web Core, Vue Router, Vue I18n, and native ECharts.
- Do not introduce CopilotKit Runtime.
- Prefer extraction and pure functions over a new global store.
- Preserve existing API paths and adapter behavior.
- Keep responsive behavior based on the current workspace container query.
- Preserve `prefers-reduced-motion` behavior.
- Preserve current history ordering/pagination semantics.
- Preserve lazy session creation: creating a new conversation in the UI must not create a backend session until first send.
- Prefer stable role/label/data-testid selectors in E2E instead of internal Element Plus X DOM structure.

## 5. Approaches considered

### Approach A — Incremental extraction in place (selected)

Keep `useAgentConversation()` and existing message components, rebuild the regression suite first, then extract orchestration concerns from `AgentChat.vue` into small composables/components.

**Advantages:** lowest regression risk; preserves working runtime behavior; each extraction can be reviewed independently; ideal for TDD and frequent commits.

**Disadvantages:** temporary duplication may exist while responsibilities are moved; legacy generated-UI code remains during migration.

### Approach B — Rewrite the conversation feature around a new store

Create a new Pinia conversation store and rewrite the entire page around it.

**Advantages:** potentially clean end-state.

**Disadvantages:** high behavioral regression risk; duplicates state already correctly owned by `HttpAgent`/`useAgentConversation()`; requires re-proving interrupt and history edge cases; violates YAGNI for this improvement cycle.

### Approach C — Keep the current structure and only patch visible bugs

Fix user bubble, model rollback, warning rendering, and old tests without component extraction.

**Advantages:** smallest short-term change.

**Disadvantages:** leaves `AgentChat.vue` as the future bottleneck; every new business card/artifact/subagent feature increases coupling; does not address the main maintainability risk.

**Decision:** Approach A.

## 6. Target architecture

```text
App / Router
  └─ AgentChat.vue                         page orchestrator only
      ├─ useAgentConversation()            AG-UI runtime + messages + interrupts
      ├─ useConversationScroll()           viewport position + pagination anchoring
      ├─ useDeliverables()                 artifact/file derivation + versions + approval binding
      ├─ useConversationPanels()           preview/deliverables/audit panel state
      ├─ ConversationHeader.vue            session identity + status + inspector actions
      ├─ ConversationViewport.vue          welcome / turns / process / pending response
      ├─ ConversationComposer.vue          sender + model + attachment queue + HITL/recovery dock
      └─ ConversationInspector.vue         FilePreview / Deliverables / Audit switch
```

The exact number of extracted components is intentionally limited. The goal is not to turn every template fragment into a component; extraction happens where a unit has a clear independent responsibility and interface.

## 7. Responsibility boundaries

### 7.1 `useAgentConversation()` remains the runtime boundary

It continues to own:

- `HttpAgent` creation/binding.
- AG-UI event subscriptions.
- raw message state.
- `running`, `responsePhase`, active text/reasoning ids.
- pending interrupts and hydration.
- send/resume/retry/stop.
- staged attachments and upload lifecycle currently supported.

It must not gain artifact presentation, scroll behavior, panel visibility, or DOM interaction.

### 7.2 `useConversationScroll()`

Owns only DOM-scroll behavior:

```ts
export type ConversationScrollController = {
  messageScroller: Ref<HTMLElement | null>
  showJumpToLatest: Ref<boolean>
  scrollToBottom(): void
  followTextReveal(): void
  handleScroll(loadOlder: () => Promise<void>, hasOlder: boolean, loadingOlder: boolean): Promise<void>
  resetFollowBottom(): void
}
```

It preserves the current behavior of anchoring scroll position when older messages are prepended.

### 7.3 `useDeliverables()`

Moves all current deliverable derivation out of `AgentChat.vue`.

Inputs:

```ts
messages: Ref<Message[]>
attachments: Ref<PendingAttachment[]>
pendingInterrupts: Ref<Interrupt[]>
```

Outputs:

```ts
deliverables: ComputedRef<ConversationFilePreview[]>
pendingDelivery: ComputedRef<ConversationFilePreview | undefined>
deliveryApprovalIds: ComputedRef<Set<string>>
generatedFilesForProcess(steps: ProcessStep[]): ConversationFilePreview[]
```

The extraction must preserve:

- message file parts;
- `dataagent.ui` file cards;
- generated artifacts from successful tool calls;
- removal of artifacts through tool metadata;
- staged input attachments;
- approval binding;
- same-name output version numbering.

### 7.4 `useConversationPanels()`

Owns mutually exclusive inspector state:

```ts
type InspectorPanel = 'none' | 'preview' | 'deliverables' | 'audit'
```

It is responsible for opening/closing panels and resetting preview approval submission state. Escape-key wiring stays at page level or a dedicated shortcut composable, but panel state must no longer be three independent booleans plus a preview ref spread through `AgentChat.vue`.

### 7.5 `ConversationComposer.vue`

Owns only presentation and DOM interaction for:

- XSender;
- attachment queue;
- file-picker trigger;
- ModelSelector placement;
- pending delivery approval dock;
- retry dock;
- `InterruptCard` placement.

It emits semantic events such as `submit`, `stop`, `retry`, `choose-files`, `remove-attachment`, `resume`, and `model-selected`. It must not call session APIs or `HttpAgent` directly.

### 7.6 `ConversationViewport.vue`

Owns rendering of:

- hydration skeleton;
- welcome state;
- paginated older-message control;
- `PresentationItem[]` turns/process/messages;
- generated artifact cards associated with process steps;
- response-pending indicator;
- jump-to-latest control.

It receives presentation data and emits semantic UI actions upward.

## 8. Generated UI policy

### 8.1 Canonical path

A2UI (`activityType: a2ui-surface`) is the canonical path for generic model-generated UI such as metrics, tables, charts, markdown, badges, and generic action buttons.

### 8.2 Legacy compatibility

`activityType: dataagent.ui` stays supported for persisted sessions and existing adapter behavior. `GenerativeUiCard.vue` is considered a compatibility renderer.

During this plan:

- do not remove `GenerativeUiCard.vue`;
- do not add new generic card kinds to it;
- keep file-delivery/approval compatibility;
- document A2UI as the extension path for new generic generated UI.

### 8.3 Fixed business UI

Business-specific, semantically stable experiences remain explicit Vue components rather than model-defined arbitrary A2UI. Future examples include Spec review or file-package review. They should be routed by explicit business activity/tool semantics, not by expanding legacy `dataagent.ui` into a second generic catalog.

## 9. Subagent presentation policy

The adapter currently emits `ACTIVITY_SNAPSHOT` with `activityType: dataagent.subagent`. Frontend documentation must use that value.

For this improvement cycle, subagent activity remains part of the process presentation rather than becoming a separate workspace graph. The presentation layer may collapse redundant activity when a matching standard tool call already represents the same work, but unmatched subagent activity must remain renderable and understandable.

No nested AG-UI `RUN_STARTED`/`RUN_FINISHED` lifecycle is introduced for subagents.

## 10. UI correctness changes

### 10.1 User message bubble

`ConversationMessage.vue` must consume the existing design tokens:

```css
--da-bubble-user-bg
--da-bubble-user-border
```

It must not use `--da-surface-3` as the bubble background. This makes the light-mode user message visibly blue-tinted instead of neutral gray while preserving token control.

### 10.2 Model selector rollback

On existing sessions, `ModelSelector.change()` currently updates `selectedKey` before the backend switch is known to have succeeded. The component must retain the previous key and restore it if `switchSessionModel()` rejects.

Opening/reading a session still must never call the backend switch API.

### 10.3 Tools warnings

`ToolPage.vue` must render actual warning strings rather than only showing a generic alert when `warnings.length > 0`.

### 10.4 Typography

Do not perform a broad visual redesign in this cycle. Only replace clearly sub-12px functional metadata where touched by extracted components. Large-scale typography/token redesign remains separate.

## 11. Testing strategy

### 11.1 Test pyramid for this work

1. Pure-function/unit-style tests where practical for extracted derivation helpers.
2. Playwright E2E for user-visible conversation flows.
3. Existing adapter tests remain the contract regression layer for OpenCode → AG-UI conversion.

### 11.2 Playwright rules

- Add `@playwright/test` to frontend dev dependencies if it is not already installed.
- Add explicit `test:e2e` package script.
- Prefer `getByRole`, labels, and stable `data-testid` owned by this project.
- Never depend on CopilotKit-era selectors.
- Never depend on private Element Plus X internal class names for critical actions.
- Mock `/dataagent/web/api/**` at the network boundary for deterministic UI tests.
- Keep one integration spec for server-backed history normalization/persistence behavior if it is still valid; migrate selectors rather than deleting coverage.

### 11.3 Required E2E scenarios

- new conversation renders without creating a session;
- first send materializes a session;
- opening another session restores its model without switching backend model;
- failed explicit model switch rolls UI back;
- streaming answer and process/reasoning render;
- stop calls the matching session interrupt endpoint;
- error shows retry and retry re-runs;
- older history is prepended without scroll jump;
- HITL responseSchema form renders and resume payload is sent;
- pending interrupt restores after hydration/reload;
- file delivery approval can be opened from artifact preview and resolved;
- A2UI surface renders allowed components and sends action payload;
- light/dark theme changes tokens and user bubble appearance;
- Tools page shows runtime warnings;
- subagent activity uses the current `dataagent.subagent` contract.

## 12. Error handling

- Extraction must not change existing user-facing error semantics from `useAgentConversation()`.
- Model-switch failure displays an Element Plus error and restores the previous selection.
- A2UI sanitation/render errors remain contained inside the generated surface card and must not crash the conversation page.
- Tool warning details are informational and do not block the Tools page.
- E2E network mocks must fail loudly for unhandled critical endpoints so stale endpoint assumptions are detected.

## 13. Migration order

The order is intentional:

1. Make Playwright runnable and replace stale selectors/assumptions.
2. Lock current behavior with regression tests.
3. Fix small correctness issues under tests.
4. Extract deliverable derivation.
5. Extract scroll/panel behavior.
6. Extract header/composer/viewport/inspector presentation.
7. Document and enforce generated-UI policy.
8. Align subagent documentation/presentation tests.
9. Run complete frontend and root checks.

No extraction should proceed while its relevant baseline E2E scenario is red for unrelated reasons.

## 14. Review boundaries

Each implementation task should be independently reviewable. A reviewer must be able to approve test-harness modernization without also approving component extraction, and approve one extraction without requiring the next extraction.

Frequent commits are required. Do not combine all conversation refactoring into one commit.

## 15. Deferred follow-up specs

After this plan is complete, the following deserve separate Superpowers design/spec cycles if they remain priorities:

- server-backed conversation rename/archive/delete;
- richer child-agent graph/timeline visualization;
- attachment progress/concurrency/retry;
- richer file previews (especially XLSX);
- complete HITL schema validation/renderer;
- A2UI catalog component modularization and bundle-level lazy loading;
- broad typography/welcome-page visual simplification.
