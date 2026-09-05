# Data Agent Conversation UI Architecture Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild a trustworthy frontend regression baseline, reduce `AgentChat.vue` to a page orchestrator, fix audited state/UI inconsistencies, and establish A2UI as the canonical generic generated-UI path without changing the AG-UI backend contract.

**Architecture:** Preserve `useAgentConversation()` as the runtime boundary and `buildPresentation()` as the raw-message-to-presentation projection. Extract scroll, deliverable, panel, composer, viewport, header, and inspector concerns incrementally behind regression tests. Keep legacy `dataagent.ui` rendering for persisted compatibility while routing new generic generated UI through A2UI.

**Tech Stack:** Vue 3.5, TypeScript 5.8, Vite 8, Element Plus 2.14, vue-element-plus-x 2.0, `@ag-ui/client` 0.0.57, A2UI Web Core 0.10, x-markdown-vue, ECharts 6, Playwright.

## Global Constraints

- Target branch: `refactor/element-plus-x-agui-vite8`.
- Execute from an isolated git worktree based on the target branch.
- Node.js must be `>=20.19.0`.
- Do not add CopilotKit Runtime.
- Do not add Pinia or another global state library for this refactor.
- Do not change AG-UI endpoint semantics, OpenCode adapter event semantics, or session API paths.
- Preserve lazy session creation: backend session creation happens on first send, not when the user clicks New.
- Preserve history order/pagination and scroll anchoring.
- Preserve interrupt hydration/resume semantics.
- Preserve responsive container-query behavior and `prefers-reduced-motion` support.
- A2UI is the canonical generic generated-UI path; `dataagent.ui` stays compatibility-only.
- Do not broaden this plan into A2UI catalog modularization, fake/local busy-state redesign, upload progress, server-backed rename, or richer file previews.
- Prefer project-owned `data-testid`, accessible roles, and labels in E2E tests. Do not depend on CopilotKit-era selectors or private Element Plus X DOM structure.
- Each task ends with an independently reviewable commit.

---

## Execution prerequisites

Before Task 1 run:

```bash
git status --short
git branch --show-current
node --version
npm --version
```

Expected:

- worktree is clean;
- current worktree is based on `refactor/element-plus-x-agui-vite8`;
- Node version is `>=20.19.0`.

Read before editing:

- `docs/superpowers/specs/2026-09-05-conversation-ui-architecture-improvement-design.md`
- `frontend/src/features/conversation/components/AgentChat.vue`
- `frontend/src/features/conversation/composables/useAgentConversation.ts`
- `frontend/src/features/conversation/processPresentation.ts`
- `frontend/src/features/conversation/api/history.ts`
- `frontend/src/a2ui/sanitizeOperations.ts`
- `frontend/docs/ag-ui-contract.md`
- `frontend/docs/subagent-visualization.md`

---

### Task 1: Make Playwright a supported frontend command and CI gate

**Files:**

- Modify: `frontend/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/refactor-frontend-check.yml`
- Keep: `frontend/playwright.config.ts`

**Interfaces:**

- Produces command: `npm run test:e2e -w frontend`
- Produces root alias: `npm run test:e2e`
- CI consumes the frontend package script rather than duplicating a raw Playwright command.

- [ ] **Step 1: Verify the command is currently unsupported**

```bash
npm run test:e2e -w frontend
```

Expected: FAIL because `test:e2e` is not defined.

- [ ] **Step 2: Install Playwright as a frontend dev dependency**

```bash
npm install -D -w frontend @playwright/test
```

Expected changes: `frontend/package.json`, root `package-lock.json`.

- [ ] **Step 3: Add package scripts**

Add to `frontend/package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:list": "playwright test --list"
```

Add to root `package.json`:

```json
"test:e2e": "npm run test:e2e -w frontend"
```

Do not put browser E2E inside root `check`; the branch CI workflow becomes the browser-aware gate.

- [ ] **Step 4: Verify test discovery**

```bash
npx playwright install chromium
npm run test:e2e:list -w frontend
```

Expected: PASS and list `frontend/e2e/*.spec.ts` tests.

- [ ] **Step 5: Add Chromium installation and E2E to branch CI**

In `.github/workflows/refactor-frontend-check.yml`, after `npm ci` add:

```yaml
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
```

After frontend build add:

```yaml
      - name: Frontend E2E
        run: npm run test:e2e -w frontend
```

- [ ] **Step 6: Verify non-browser build gates**

```bash
npm run typecheck -w frontend
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json package.json package-lock.json .github/workflows/refactor-frontend-check.yml
git commit -m "test: make frontend Playwright a supported check"
```

---

### Task 2: Replace stale E2E infrastructure with current project-owned helpers

**Files:**

- Create: `frontend/e2e/helpers/dataagent.ts`
- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/lazy-session.spec.ts`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`
- Modify: `frontend/e2e/light-conversation-theme.spec.ts`
- Modify: `frontend/e2e/server-conversation-persistence.spec.ts`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`

**Interfaces:**

`frontend/e2e/helpers/dataagent.ts` must export:

```ts
import type { Page, Route } from '@playwright/test'

export const ACTIVE_SESSION_KEY = 'dataagent.conversations.active.v3'
export const MODEL_SELECTION_KEY = 'dataagent.model.selection.v4.by-session'

export type ApiOverride = (
  route: Route,
  url: URL,
) => boolean | Promise<boolean>

export async function json(route: Route, body: unknown, status = 200): Promise<void>
export function sse(events: unknown[]): string
export async function mockBaseApi(page: Page, override?: ApiOverride): Promise<void>
export async function seedActiveSession(page: Page, sessionId: string): Promise<void>
```

- [ ] **Step 1: Add one failing stable-selector smoke assertion**

Add to `core-flows.spec.ts`:

```ts
await expect(page.getByTestId('conversation-composer')).toBeVisible()
```

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts
```

Expected: FAIL because the project-owned test id does not yet exist.

- [ ] **Step 2: Add only stable page-boundary test ids**

In `AgentChat.vue` add:

- `data-testid="conversation-chat"` on the outer layout;
- `data-testid="conversation-messages"` on the scroll viewport;
- `data-testid="conversation-composer"` on the composer wrapper.

Tests should locate the actual textbox/button from inside the composer using roles/labels, not Element Plus X private classes.

- [ ] **Step 3: Create the shared API fixture helper**

Use current endpoints and OpenCode V2 response shapes. Default session fixture:

```ts
{
  id: 'session-a',
  title: '会话 A',
  time: { created: 2, updated: 2 }
}
```

Default model fixture must match current `ModelSelector.vue` model fields.

Unhandled critical `/session`, `/session/:id/message`, `/model`, `/model/default`, `/agui`, upload, interrupt, and model-switch calls should not silently return unrelated `{ data: {} }` if a test depends on them; overrides should make missing assumptions visible.

- [ ] **Step 4: Remove stale architecture selectors/keys from all five specs**

Replace/remove:

- `copilot-chat-input-*`
- `data-copilotkit`
- `.draft-model-selector__select`
- `.model-selector__select`
- `.conversation-chat`
- `.assistant-panel`
- `.dynamic-workspace-shell`
- `dataagent.conversations.active.v2.session-thread`
- legacy `dataagent.theme`

Use current `dataagent.theme.v2` only when a test needs to seed theme directly.

- [ ] **Step 5: Run the full E2E suite and classify real failures**

```bash
npm run test:e2e -w frontend
```

Expected: remaining failures represent current behavior gaps rather than missing old DOM/classes. Do not weaken behavior assertions merely to make the suite green.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e frontend/src/features/conversation/components/AgentChat.vue
git commit -m "test: align e2e suite with current conversation UI"
```

---

### Task 3: Lock and fix audited UI/state correctness issues

**Files:**

- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/light-conversation-theme.spec.ts`
- Modify: `frontend/src/features/conversation/components/ConversationMessage.vue`
- Modify: `frontend/src/features/model/components/ModelSelector.vue`
- Modify: `frontend/src/features/tool/pages/ToolPage.vue`

**Interfaces:**

- `ModelSelector` event remains `selected: [model: ModelSelection]`.
- No API signature changes.

- [ ] **Step 1: Write a failing light-user-bubble test**

In light mode, assert the visible user bubble uses the dedicated blue-tinted bubble styling and is not equal to neutral `--da-surface-3`. Assert its border reflects `--da-bubble-user-border`.

```bash
npm run test:e2e -w frontend -- light-conversation-theme.spec.ts
```

Expected: FAIL with current `--da-surface-3` bubble implementation.

- [ ] **Step 2: Use dedicated user-bubble tokens**

In `ConversationMessage.vue`, consume:

```css
--da-bubble-user-bg
--da-bubble-user-border
```

Do not hard-code light/dark colors in the component.

- [ ] **Step 3: Write a failing model-switch rollback test**

Mock `POST /session/session-a/model` to fail. Change GPT A → Claude B. Assert the displayed selection returns to GPT A.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "model"
```

Expected: FAIL before implementation.

- [ ] **Step 4: Implement rollback in `ModelSelector.change()`**

Use this state pattern:

```ts
const previousKey = selectedKey.value
selectedKey.value = key
try {
  await switchSessionModel(props.sessionId, model)
  emit('selected', model)
} catch (error) {
  selectedKey.value = previousKey
  ElMessage.error(error instanceof Error ? error.message : String(error))
} finally {
  changing.value = false
}
```

Do not call `switchSessionModel()` from `load()`.

- [ ] **Step 5: Write a failing Tools warning-details test**

Return two warning strings from `/tools` and assert both are visible.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "warning"
```

Expected: FAIL because current UI only renders a generic alert title.

- [ ] **Step 6: Render warning strings in `ToolPage.vue`**

Keep the warning non-blocking. Show the actual strings below/inside the warning area and keep tool cards usable.

- [ ] **Step 7: Verify**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts light-conversation-theme.spec.ts
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/e2e/core-flows.spec.ts frontend/e2e/light-conversation-theme.spec.ts frontend/src/features/conversation/components/ConversationMessage.vue frontend/src/features/model/components/ModelSelector.vue frontend/src/features/tool/pages/ToolPage.vue
git commit -m "fix: align conversation UI state and tokens"
```

---

### Task 4: Extract deliverable derivation from `AgentChat.vue`

**Files:**

- Create: `frontend/src/features/conversation/composables/useDeliverables.ts`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify if fixtures need reuse: `frontend/e2e/helpers/dataagent.ts`

**Interfaces:**

```ts
import type { ComputedRef, Ref } from 'vue'
import type { Interrupt, Message } from '@ag-ui/client'
import type { PendingAttachment } from './useAgentConversation'
import type { ConversationFilePreview } from '../types/filePreview'
import type { ProcessStep } from '../processPresentation'

export type DeliverablesController = {
  deliverables: ComputedRef<ConversationFilePreview[]>
  pendingDelivery: ComputedRef<ConversationFilePreview | undefined>
  deliveryApprovalIds: ComputedRef<Set<string>>
  generatedFilesForProcess(steps: ProcessStep[]): ConversationFilePreview[]
}

export function useDeliverables(
  messages: Ref<Message[]>,
  attachments: Ref<PendingAttachment[]>,
  pendingInterrupts: Ref<Interrupt[]>,
): DeliverablesController
```

- [ ] **Step 1: Add characterization coverage for deliverable versions and approval binding**

Create an E2E fixture with two same-name outputs and a pending approval associated with the latest output. Assert `v1`/`v2` presentation and the review/approval affordance.

If current test fixtures can express artifact removal, also assert removed outputs disappear; do not invent a new production protocol solely for the test.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "deliverable"
```

Expected: baseline PASS or a real existing defect that must be fixed before refactoring.

- [ ] **Step 2: Move deliverable helper logic into `useDeliverables.ts`**

Move without behavior changes:

- `previewFromPart`
- `generatedFilesFromTool`
- successful tool id derivation
- artifact removal application
- staged attachment inclusion
- approval-target binding
- same-name version numbering
- `generatedFilesForProcess`

Keep `dataAgentWebApi()` URL construction in this composable because it belongs to artifact presentation derivation.

- [ ] **Step 3: Rewire `AgentChat.vue`**

Use:

```ts
const {
  deliverables,
  pendingDelivery,
  deliveryApprovalIds,
  generatedFilesForProcess,
} = useDeliverables(messages, attachments, pendingInterrupts)
```

Delete the old duplicate logic.

- [ ] **Step 4: Verify**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "deliverable|approval|file"
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/conversation/composables/useDeliverables.ts frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/core-flows.spec.ts frontend/e2e/helpers/dataagent.ts
git commit -m "refactor: extract conversation deliverable model"
```

---

### Task 5: Extract scroll and history-anchor behavior

**Files:**

- Create: `frontend/src/features/conversation/composables/useConversationScroll.ts`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

```ts
export function useConversationScroll(options: {
  hasMessages: () => boolean
  hasOlder: () => boolean
  loadingOlder: () => boolean
  loadOlder: () => Promise<void>
}): {
  messageScroller: Ref<HTMLElement | null>
  showJumpToLatest: Ref<boolean>
  scrollToBottom(): void
  followTextReveal(): void
  handleScroll(): Promise<void>
  resetFollowBottom(): void
}
```

- [ ] **Step 1: Add/repair history scroll characterization**

The E2E must:

1. open a session with a next cursor;
2. scroll near the top;
3. load the older page;
4. verify older messages appear;
5. verify the viewport does not jump to bottom;
6. verify the jump-to-latest affordance when away from bottom.

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts
```

Expected: PASS before refactor.

- [ ] **Step 2: Move scroll-local state/functions**

Move from `AgentChat.vue`:

- `messageScroller`
- `showJumpToLatest`
- `followBottom`
- `previousScrollHeight`
- `scrollToBottom`
- `followTextReveal`
- `handleScroll`

Do not move `loadOlder()` out of `useAgentConversation()`.

- [ ] **Step 3: Rewire message/session behavior**

Message changes delegate bottom-follow behavior to the controller. Session changes call `resetFollowBottom()`.

- [ ] **Step 4: Verify**

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/conversation/composables/useConversationScroll.ts frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/history-chat-layout.spec.ts
git commit -m "refactor: isolate conversation scroll behavior"
```

---

### Task 6: Centralize mutually exclusive inspector-panel state

**Files:**

- Create: `frontend/src/features/conversation/composables/useConversationPanels.ts`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

```ts
export type InspectorPanel = 'none' | 'preview' | 'deliverables' | 'audit'

export function useConversationPanels(): {
  panel: Ref<InspectorPanel>
  activePreview: Ref<ConversationFilePreview | null>
  previewApprovalSubmitted: Ref<boolean>
  openPreview(file: ConversationFilePreview): void
  openDeliverables(file?: ConversationFilePreview): void
  toggleDeliverables(): void
  toggleAudit(): void
  closeInspector(): void
  markPreviewApprovalSubmitted(): void
}
```

- [ ] **Step 1: Characterize panel exclusivity**

Assert:

- opening Deliverables closes Audit;
- opening a file switches to Preview;
- Escape closes the active inspector;
- preview/deliverables/audit are never simultaneously visible.

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts -g "inspector"
```

Expected: PASS before refactor.

- [ ] **Step 2: Implement the controller**

Move from `AgentChat.vue`:

- `activePreview`
- `deliverablesOpen`
- `auditOpen`
- `previewApprovalSubmitted`
- open/toggle/close functions

Use the `InspectorPanel` discriminated value instead of independent booleans.

- [ ] **Step 3: Preserve preview synchronization**

Keep the existing watch that updates an already-open preview when deliverable approval/version metadata changes, but read/write via `activePreview` from the controller.

- [ ] **Step 4: Verify**

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/conversation/composables/useConversationPanels.ts frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/history-chat-layout.spec.ts
git commit -m "refactor: centralize conversation inspector state"
```

---

### Task 7: Extract conversation header and inspector renderer

**Files:**

- Create: `frontend/src/features/conversation/components/ConversationHeader.vue`
- Create: `frontend/src/features/conversation/components/ConversationInspector.vue`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

`ConversationHeader.vue`:

```ts
props: {
  sessionId: string
  displayName?: string
  running: boolean
  hydrating: boolean
  pendingInterruptCount: number
  deliverableCount: number
  hasError: boolean
  activePanel: InspectorPanel
}

events: {
  toggleDeliverables: []
  toggleAudit: []
}
```

`ConversationInspector.vue`:

```ts
props: {
  panel: InspectorPanel
  activePreview: ConversationFilePreview | null
  deliverables: ConversationFilePreview[]
  auditEntries: AuditEntry[]
  previewInterrupts: Interrupt[]
  running: boolean
  pendingApprovalCount: number
  approvalSubmitted: boolean
}

events: {
  close: []
  selectDeliverable: [ConversationFilePreview]
  resume: [ResumeEntry[]]
}
```

- [ ] **Step 1: Add stable assertions for header/inspector actions**

Assert existing Record/Deliverables labels and ready/running/pending status. Do not assert SVG internals.

- [ ] **Step 2: Extract header template and component-specific styles**

Keep session/runtime state computation in `AgentChat.vue`.

- [ ] **Step 3: Extract inspector switch**

Move the `FilePreviewPanel` / `DeliverablesPanel` / `AuditPanel` conditional rendering into `ConversationInspector.vue`.

- [ ] **Step 4: Preserve page layout ownership**

Keep `.agent-chat-layout`, preview grid, overlay media/container queries, and page shell rules in `AgentChat.vue`. Only header-specific styles move to the header component.

- [ ] **Step 5: Verify**

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/conversation/components/ConversationHeader.vue frontend/src/features/conversation/components/ConversationInspector.vue frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/history-chat-layout.spec.ts
git commit -m "refactor: extract conversation header and inspector"
```

---

### Task 8: Extract the composer without moving runtime logic

**Files:**

- Create: `frontend/src/features/conversation/components/ConversationComposer.vue`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/lazy-session.spec.ts`
- Modify: `frontend/e2e/core-flows.spec.ts`

**Interfaces:**

`ConversationComposer.vue` must not import session APIs, history APIs, or `HttpAgent`.

Props:

```ts
{
  sessionId?: string
  running: boolean
  hydrating: boolean
  attachments: PendingAttachment[]
  pendingInterrupts: Interrupt[]
  pendingDelivery?: ConversationFilePreview
  composerInterrupts: Interrupt[]
  error: string
}
```

Events:

```ts
{
  submit: [text: string]
  stop: []
  retry: []
  chooseFiles: []
  removeAttachment: [id: string]
  resume: [entries: ResumeEntry[]]
  reviewDelivery: [file: ConversationFilePreview]
  modelSelected: [model: ModelSelection]
}
```

Expose:

```ts
focus(): void
setText(text: string): void
clearIfMatches(text: string): void
```

- [ ] **Step 1: Lock current composer behavior**

E2E assertions must cover:

- new draft does not create backend session;
- first submit creates the session once;
- staged attachment is not uploaded until send;
- running state exposes Stop through XSender cancel behavior;
- pending interrupt blocks normal send and shows `InterruptCard`;
- retry invokes retry;
- model selection is available inside composer.

```bash
npm run test:e2e -w frontend -- lazy-session.spec.ts core-flows.spec.ts
```

Expected: PASS before extraction.

- [ ] **Step 2: Extract composer DOM/state local to XSender**

Move:

- XSender/ref;
- attachment queue;
- file button;
- ModelSelector placement;
- approval dock;
- run-recovery dock;
- InterruptCard placement;
- assurance row.

- [ ] **Step 3: Keep orchestration in `AgentChat.vue`**

Parent still calls:

- `send()`
- `retry()`
- `resume()`
- `stop()`
- session materialization emits
- error notification

Composer emits intent only.

- [ ] **Step 4: Rewire starter prompts and continue-from-step**

Use exposed `setText()`/`focus()` methods rather than reaching into XSender internals from `AgentChat.vue`.

- [ ] **Step 5: Verify**

```bash
npm run test:e2e -w frontend -- lazy-session.spec.ts core-flows.spec.ts
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/conversation/components/ConversationComposer.vue frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/lazy-session.spec.ts frontend/e2e/core-flows.spec.ts
git commit -m "refactor: extract conversation composer"
```

---

### Task 9: Extract the conversation viewport

**Files:**

- Create: `frontend/src/features/conversation/components/ConversationViewport.vue`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

`ConversationViewport.vue` receives presentation data, not runtime clients.

Props:

```ts
{
  hydrating: boolean
  loadingOlder: boolean
  hasOlder: boolean
  presentationItems: PresentationItem[]
  running: boolean
  activeTextId: string
  animatedMessageIds: Set<string>
  activeReasoningId: string
  responsePhase: 'waiting' | 'thinking' | 'responding' | 'working'
  showResponsePending: boolean
  pendingInterruptIds: string[]
  generatedFilesForProcess: (steps: ProcessStep[]) => ConversationFilePreview[]
  showJumpToLatest: boolean
}
```

Events:

```ts
{
  scroll: []
  loadOlder: []
  jumpLatest: []
  reveal: []
  preview: [ConversationFilePreview]
  confirm: [interruptId: string]
  cancel: [interruptId: string]
  a2uiAction: [unknown]
  continue: [Message]
  starter: [prompt: string]
}
```

- [ ] **Step 1: Lock reasoning/tool/final-answer ordering**

Use one fixture that streams reasoning, a tool call/result, and final text. Assert:

- process group is rendered;
- final answer remains a separate answer message after the process group;
- pending response indicator disappears at run finish.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "reasoning|tool|stream"
```

Expected: PASS before extraction.

- [ ] **Step 2: Extract viewport template**

Move:

- hydration skeleton;
- welcome state;
- load-older control;
- turn/process/message rendering;
- GeneratedArtifactCard rendering;
- response-pending indicator;
- jump-to-latest button.

- [ ] **Step 3: Keep presentation computation in parent**

`AgentChat.vue` continues to own:

```ts
const presentationItems = computed(() => buildPresentation(...))
```

The viewport renders `PresentationItem[]` and emits semantic actions.

- [ ] **Step 4: Move only viewport-owned styles**

Move welcome/message-list/process-adjacent styles as needed. Keep page grid, inspector grid, and container-query shell rules in `AgentChat.vue`.

- [ ] **Step 5: Verify**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts history-chat-layout.spec.ts
npm run typecheck -w frontend
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 6: Review the resulting `AgentChat.vue`**

It should now primarily contain:

- composable/runtime wiring;
- derived presentation state;
- semantic action handlers;
- session/error/message watchers;
- keyboard shortcut orchestration;
- page layout.

It must not still contain the deliverable algorithm, scroll algorithm, three independent inspector booleans, XSender implementation, or the full message-list template.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/conversation/components/ConversationViewport.vue frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/core-flows.spec.ts frontend/e2e/history-chat-layout.spec.ts
git commit -m "refactor: reduce agent chat to page orchestration"
```

---

### Task 10: Lock the A2UI-first generated-UI policy

**Files:**

- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify only if a stable selector is required: `frontend/src/features/conversation/components/A2uiSurfaceCard.vue`
- Create: `frontend/docs/generated-ui-policy.md`
- Modify: `frontend/docs/ag-ui-contract.md`

**Interfaces:**

- Legacy compatibility activity remains exactly `dataagent.ui`.
- Canonical generic generated-UI activity remains exactly `a2ui-surface`.
- `useAgentConversation.sendA2uiAction(action)` signature remains unchanged.
- This task does **not** redesign ActionButton busy-state semantics or refactor the A2UI catalog.

- [ ] **Step 1: Add deterministic A2UI rendering/action E2E**

Fixture must render at least two allowed generic components, including an actionable component. Assert:

- generated content is visible through the A2UI surface;
- clicking the action triggers a later `/agui` request;
- request contains `forwardedProps.a2uiAction`.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "A2UI"
```

Expected: PASS or expose a real existing action-forwarding defect.

- [ ] **Step 2: Add only a project-owned selector if semantic locating is insufficient**

If current `NativeA2uiSurface` `data-testid="a2ui-activity-renderer"` is sufficient, do not modify production code. Do not add selectors merely for convenience.

- [ ] **Step 3: Create generated-UI policy documentation**

`frontend/docs/generated-ui-policy.md` must state:

1. new generic model-generated UI uses A2UI;
2. `dataagent.ui` remains compatibility-only for persisted/existing flows;
3. do not add new generic metric/table/chart/markdown card kinds to `GenerativeUiCard`;
4. fixed business workflows use explicit Vue components and explicit business semantics;
5. persisted A2UI operations must remain safe to sanitize and replay during hydration.

- [ ] **Step 4: Link policy from AG-UI contract**

Update `frontend/docs/ag-ui-contract.md` to reference the new policy. Do not change transport/event semantics in this task.

- [ ] **Step 5: Verify**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "A2UI"
npm run typecheck -w frontend
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/core-flows.spec.ts frontend/src/features/conversation/components/A2uiSurfaceCard.vue frontend/docs/generated-ui-policy.md frontend/docs/ag-ui-contract.md
git commit -m "docs: establish A2UI-first generated UI policy"
```

If `A2uiSurfaceCard.vue` was not modified, omit it from `git add`.

---

### Task 11: Align subagent presentation and documentation with runtime contract

**Files:**

- Modify: `frontend/docs/subagent-visualization.md`
- Modify: `frontend/src/features/conversation/components/ConversationMessage.vue`
- Modify only if the E2E exposes a deduplication defect: `frontend/src/features/conversation/processPresentation.ts`
- Modify: `frontend/src/i18n/index.ts`
- Modify: `frontend/e2e/core-flows.spec.ts`

**Interfaces:**

Runtime activity type is exactly:

```text
dataagent.subagent
```

No nested AG-UI `RUN_STARTED`/`RUN_FINISHED` lifecycle is introduced for subagents.

- [ ] **Step 1: Write a failing unmatched-subagent E2E**

Emit:

```json
{
  "type": "ACTIVITY_SNAPSHOT",
  "messageId": "subagent-sql-agent",
  "activityType": "dataagent.subagent",
  "content": {
    "agentId": "sql-agent",
    "name": "SQL Agent",
    "task": "查询最近30天销售趋势",
    "status": "running"
  }
}
```

Assert the process UI visibly identifies `SQL Agent` and its task rather than a generic “run updated” message.

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "subagent"
```

Expected: FAIL before renderer/i18n enhancement.

- [ ] **Step 2: Add explicit `dataagent.subagent` activity presentation**

In `ConversationMessage.vue`, add an explicit branch in the existing `activity` computed before the generic fallback.

Required behavior:

- title includes `content.name` or `content.agentId` fallback;
- detail uses `content.task` when present;
- `queued`/`running` use active tone;
- `completed` uses success tone;
- `failed`/`error` uses warning tone;
- activity stays visible when unmatched by a standard tool call.

Do not create a new component unless the current compact activity card cannot express these fields.

- [ ] **Step 3: Add i18n keys in both locales**

Add only the message strings needed by the explicit subagent state labels in `frontend/src/i18n/index.ts`. Do not hard-code Chinese/English strings in `ConversationMessage.vue`.

- [ ] **Step 4: Preserve deduplication semantics**

Current `processPresentation.ts` may suppress `dataagent.subagent` only when a matching standard tool call already represents the same work. If the Step 1 fixture is unmatched, it must reach `ConversationMessage.vue`.

Modify `processPresentation.ts` only if the test proves the unmatched activity is being incorrectly dropped.

- [ ] **Step 5: Correct the subagent contract doc**

Update `frontend/docs/subagent-visualization.md`:

- replace stale `activityType: subagent` with `activityType: dataagent.subagent`;
- describe current Conversation-first process presentation;
- retain the rule that subagents do not open nested AG-UI Run lifecycles.

- [ ] **Step 6: Verify**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "subagent"
npm test -w adapter
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/docs/subagent-visualization.md frontend/src/features/conversation/components/ConversationMessage.vue frontend/src/features/conversation/processPresentation.ts frontend/src/i18n/index.ts frontend/e2e/core-flows.spec.ts
git commit -m "fix: align subagent presentation contract"
```

If `processPresentation.ts` was unchanged, omit it from `git add`.

---

### Task 12: Full regression, stale-marker cleanup, and verification record

**Files:**

- Modify: `frontend/docs/BUILD-VERIFICATION.md`
- Modify as needed: `frontend/e2e/*.spec.ts`
- Delete only code that is fully superseded and proven unused.

**Interfaces:**

No production interface changes in this task.

- [ ] **Step 1: Scan for stale architecture markers**

```bash
grep -R "copilot-chat-input\|data-copilotkit\|dynamic-workspace-shell\|active.v2.session-thread" frontend/e2e frontend/src || true
```

Expected: no stale runtime/E2E references, except intentionally quoted migration documentation outside these paths.

- [ ] **Step 2: Check generated-UI scope**

Review `GenerativeUiCard.vue` and shared legacy normalization. Confirm this work did not add new generic legacy card kinds. Existing compatibility behavior stays intact.

- [ ] **Step 3: Run complete project verification**

```bash
npm test -w adapter
npm run check:offline -w frontend
npm run typecheck -w frontend
npm run build -w frontend
npm run test:e2e -w frontend
npm run build
```

Expected: all commands PASS.

- [ ] **Step 4: Update build verification record**

Update `frontend/docs/BUILD-VERIFICATION.md` with:

- Playwright now being installed/supported;
- actual current E2E test/scenario count from the run;
- Chromium local/CI requirement;
- adapter test/typecheck/build/E2E status;
- remaining bundle-size warning if still present.

Do not copy an old scenario count.

- [ ] **Step 5: Review scope and formatting**

```bash
git diff --check
git status --short
```

Then inspect the complete branch diff against the Task 1 base commit. Verify no backend API contract, session endpoint, or unrelated feature changed.

- [ ] **Step 6: Commit verification updates**

```bash
git add frontend/docs/BUILD-VERIFICATION.md frontend/e2e
git commit -m "docs: record conversation UI regression baseline"
```

- [ ] **Step 7: Final command gate**

```bash
npm run test:e2e
npm run check
```

Expected:

- `npm run test:e2e` PASS;
- existing root `npm run check` PASS;
- branch CI separately runs browser E2E.

---

## Task dependency order

Execute strictly in this order:

```text
1 Playwright support / CI
  ↓
2 E2E migration
  ↓
3 audited correctness fixes
  ↓
4 deliverables extraction
  ↓
5 scroll extraction
  ↓
6 panel-state extraction
  ↓
7 header / inspector extraction
  ↓
8 composer extraction
  ↓
9 viewport extraction
  ↓
10 generated-UI policy
  ↓
11 subagent contract alignment
  ↓
12 full regression / verification
```

Do not parallelize Tasks 4–9 against the same branch: they all modify `AgentChat.vue` and would create unnecessary conflicts.

Tasks 10 and 11 may use fresh subagents only after Task 9 is integrated because they consume the finalized presentation boundaries.

## Review checklist for every task

Before accepting a task:

- targeted tests are green;
- `npm run typecheck -w frontend` is green for production-code tasks;
- no direct `HttpAgent`/API calls were introduced into presentational child components;
- no new global state library was introduced;
- no algorithm remains duplicated in old/new locations;
- props/events are semantic rather than UI-library-internal;
- existing user-facing error behavior is preserved;
- commit contains only the task scope.

## Completion criteria

The plan is complete only when:

1. CI installs Chromium and runs `npm run test:e2e -w frontend`.
2. stale CopilotKit-era E2E assumptions are removed.
3. `AgentChat.vue` is a page orchestrator rather than owner of deliverable, scroll, panel, composer, and viewport internals.
4. user bubble consumes dedicated tokens.
5. failed model switching rolls back visual selection.
6. Tools warnings show real warning strings.
7. A2UI is documented/tested as the generic generated-UI extension path.
8. `dataagent.ui` remains backwards-compatible but is not expanded.
9. `dataagent.subagent` is the documented/tested runtime activity type and is understandable when unmatched.
10. adapter tests, frontend offline check, typecheck, build, and E2E all pass.

## Execution handoff

Recommended mode: **Subagent-Driven Development**. Dispatch one fresh implementation agent per Task, run the task-specific command gate, then perform a review gate before moving to the next Task.

Alternative: **Executing Plans** in a separate session/worktree, with checkpoints after Tasks 3, 6, 9, and 12.
