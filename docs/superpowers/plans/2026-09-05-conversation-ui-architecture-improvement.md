# Data Agent Conversation UI Architecture Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild a trustworthy frontend regression baseline, reduce `AgentChat.vue` to a page orchestrator, fix audited state/UI inconsistencies, and establish A2UI as the canonical generic generated-UI path without changing the AG-UI backend contract.

**Architecture:** Preserve `useAgentConversation()` as the runtime boundary and `buildPresentation()` as the message-to-presentation projection. Extract scroll, deliverable, panel, composer, viewport, header, and inspector concerns incrementally behind characterization/E2E tests. Keep legacy `dataagent.ui` rendering for compatibility while routing all new generic generated UI through A2UI.

**Tech Stack:** Vue 3.5, TypeScript 5.8, Vite 8, Element Plus 2.14, vue-element-plus-x 2.0, `@ag-ui/client` 0.0.57, A2UI Web Core 0.10, x-markdown-vue, ECharts 6, Playwright.

## Global Constraints

- Target branch: `refactor/element-plus-x-agui-vite8`.
- Work from an isolated git worktree when executing this plan.
- Node.js must be `>=20.19.0`.
- Do not add CopilotKit Runtime.
- Do not add Pinia or another global state library for this refactor.
- Do not change AG-UI endpoint semantics, OpenCode adapter event semantics, or session API paths.
- Preserve lazy session creation: backend session creation happens on first send, not when the user clicks New.
- Preserve history order/pagination and scroll anchoring.
- Preserve interrupt hydration/resume semantics.
- Preserve responsive container-query behavior and `prefers-reduced-motion` support.
- A2UI is the canonical generic generated-UI path; `dataagent.ui` stays compatibility-only.
- Prefer project-owned `data-testid`, accessible roles, and labels in E2E tests. Do not depend on CopilotKit-era selectors or private Element Plus X internals.
- Each task ends with an independently reviewable commit.

---

## Execution prerequisites

Before Task 1:

```bash
git status --short
git branch --show-current
node --version
npm --version
```

Expected:

- worktree is clean;
- branch/worktree is based on `refactor/element-plus-x-agui-vite8`;
- Node version is `>=20.19.0`.

Read these files before editing:

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

- Produces: `npm run test:e2e -w frontend`
- Produces: root `npm run test:e2e`
- CI consumes the same frontend script; do not duplicate the Playwright command in workflow YAML.

- [ ] **Step 1: Confirm the current unsupported state**

Run:

```bash
npm run test:e2e -w frontend
```

Expected: FAIL because `test:e2e` is not defined.

- [ ] **Step 2: Add Playwright as a frontend dev dependency**

Run:

```bash
npm install -D -w frontend @playwright/test
```

Expected changes: `frontend/package.json` and root `package-lock.json`.

- [ ] **Step 3: Add package scripts**

In `frontend/package.json` add:

```json
"test:e2e": "playwright test",
"test:e2e:list": "playwright test --list"
```

In root `package.json` add:

```json
"test:e2e": "npm run test:e2e -w frontend"
```

Do not add E2E to the root `check` script yet; CI becomes the browser-aware gate in Step 5.

- [ ] **Step 4: Verify Playwright discovers the existing suite**

Run:

```bash
npx playwright install chromium
npm run test:e2e:list -w frontend
```

Expected: PASS and list tests from `frontend/e2e/*.spec.ts`.

- [ ] **Step 5: Add browser installation and E2E to the refactor workflow**

In `.github/workflows/refactor-frontend-check.yml`, after `npm ci`, add:

```yaml
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
```

After frontend build add:

```yaml
      - name: Frontend E2E
        run: npm run test:e2e -w frontend
```

- [ ] **Step 6: Run non-browser verification**

Run:

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

### Task 2: Replace stale E2E infrastructure with project-owned test helpers

**Files:**

- Create: `frontend/e2e/helpers/dataagent.ts`
- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/lazy-session.spec.ts`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`
- Modify: `frontend/e2e/light-conversation-theme.spec.ts`
- Modify: `frontend/e2e/server-conversation-persistence.spec.ts`

**Interfaces:**

- Produces helper functions:

```ts
export const ACTIVE_SESSION_KEY = 'dataagent.conversations.active.v3'
export const MODEL_SELECTION_KEY = 'dataagent.model.selection.v4.by-session'
export function json(route: Route, body: unknown, status?: number): Promise<void>
export function sse(events: unknown[]): string
export function mockBaseApi(page: Page, override?: ApiOverride): Promise<void>
export function seedActiveSession(page: Page, sessionId: string): Promise<void>
```

- Existing specs consume these helpers instead of redefining API mocks and stale storage keys.

- [ ] **Step 1: Add a failing smoke assertion for current UI semantics**

Update one spec to assert the current page exposes the Element Plus X conversation input through a project-owned wrapper selector that does not yet exist:

```ts
await expect(page.getByTestId('conversation-composer')).toBeVisible()
```

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts
```

Expected: FAIL because the stable test id is not present yet.

- [ ] **Step 2: Add stable top-level test ids only where needed**

Modify `frontend/src/features/conversation/components/AgentChat.vue` minimally:

- add `data-testid="conversation-chat"` to the outer layout;
- add `data-testid="conversation-messages"` to the message scroller;
- add `data-testid="conversation-composer"` to the composer wrapper.

Do not expose internal Element Plus X classes.

- [ ] **Step 3: Create shared E2E helpers**

Move repeated JSON/SSE/mock setup into `frontend/e2e/helpers/dataagent.ts`. Use current keys and current endpoints only.

The default session fixture must match OpenCode V2 shape:

```ts
{
  id: 'session-a',
  title: '会话 A',
  time: { created: 2, updated: 2 }
}
```

The default model fixture must match current `ModelSelector.vue` expectations.

- [ ] **Step 4: Remove CopilotKit-era selectors and stale storage keys from all five specs**

Remove/replace references such as:

- `copilot-chat-input-*`
- `data-copilotkit`
- `.draft-model-selector__select`
- `.model-selector__select`
- `.conversation-chat`
- `.assistant-panel`
- `.dynamic-workspace-shell`
- `dataagent.conversations.active.v2.session-thread`
- `dataagent.theme`

Use roles, labels, current `.model-selector` only when no semantic selector exists, and project-owned test ids for page boundaries.

- [ ] **Step 5: Run the full current suite and classify failures**

Run:

```bash
npm run test:e2e -w frontend
```

Expected: remaining failures must represent real current behavior gaps, not missing old DOM/classes. Record them in commit notes; do not weaken assertions to make them green.

- [ ] **Step 6: Commit the test-infrastructure migration**

```bash
git add frontend/e2e frontend/src/features/conversation/components/AgentChat.vue
git commit -m "test: align e2e suite with current conversation UI"
```

---

### Task 3: Lock and fix the audited UI/state correctness issues

**Files:**

- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/light-conversation-theme.spec.ts`
- Modify: `frontend/src/features/conversation/components/ConversationMessage.vue`
- Modify: `frontend/src/features/model/components/ModelSelector.vue`
- Modify: `frontend/src/features/tool/pages/ToolPage.vue`

**Interfaces:**

- `ModelSelector` public events stay unchanged: `selected: [model: ModelSelection]`.
- No API signature changes.

- [ ] **Step 1: Add failing light-user-bubble assertions**

Test the computed bubble style in light mode against the dedicated token behavior. Assert the bubble is not equal to neutral `--da-surface-3` and that its border uses the bubble-border token.

Run:

```bash
npm run test:e2e -w frontend -- light-conversation-theme.spec.ts
```

Expected: FAIL on current `--da-surface-3` implementation.

- [ ] **Step 2: Use the dedicated bubble tokens**

In `ConversationMessage.vue`, change the user bubble styling to consume:

```css
--da-bubble-user-bg
--da-bubble-user-border
```

Keep text contrast and existing Element Plus X Bubble structure.

- [ ] **Step 3: Add a failing model-switch rollback test**

Mock `POST /session/session-a/model` to return an error. Change from GPT A to Claude B and assert the visible selection returns to GPT A after the request fails.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "model"
```

Expected: FAIL before implementation because `selectedKey` remains on the rejected model.

- [ ] **Step 4: Implement model rollback**

In `ModelSelector.change(key)`:

```ts
const previousKey = selectedKey.value
selectedKey.value = key
...
catch (error) {
  selectedKey.value = previousKey
  ElMessage.error(...)
}
```

Do not call `switchSessionModel()` during `load()`.

- [ ] **Step 5: Add a failing Tools warning-details test**

Mock `loadCapabilityCatalog` response with two warning strings and assert both are visible.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "warning"
```

Expected: FAIL because the current page only renders a generic alert title.

- [ ] **Step 6: Render warning details**

In `ToolPage.vue`, render the actual `warnings` list below/inside the warning alert. Keep warnings non-blocking and searchable tools visible.

- [ ] **Step 7: Run targeted and full checks**

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
- Modify if needed for fixtures: `frontend/e2e/helpers/dataagent.ts`

**Interfaces:**

`useDeliverables.ts` must export:

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

- [ ] **Step 1: Add characterization E2E for deliverable version/removal/approval**

Create one scenario that returns two same-name generated artifacts and asserts `v1`/`v2`, then provides a pending approval for the latest output. If the adapter fixture supports a removal artifact event, also assert removed files disappear.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "deliverable"
```

Expected: PASS on baseline or reveal a real pre-existing defect. Fix only real behavior defects before extraction.

- [ ] **Step 2: Move pure helper functions first**

Move from `AgentChat.vue` into `useDeliverables.ts` without behavior changes:

- `previewFromPart`
- `generatedFilesFromTool`
- deliverable computed construction
- version assignment
- approval-target binding
- `generatedFilesForProcess`

Keep URL construction using `dataAgentWebApi` inside the new composable.

- [ ] **Step 3: Replace local computed state in `AgentChat.vue`**

Instantiate:

```ts
const {
  deliverables,
  pendingDelivery,
  deliveryApprovalIds,
  generatedFilesForProcess,
} = useDeliverables(messages, attachments, pendingInterrupts)
```

Delete the duplicated implementation from `AgentChat.vue`.

- [ ] **Step 4: Run targeted tests**

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

Export:

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

- [ ] **Step 1: Add/repair a scroll-anchor characterization test**

The test must:

1. open a session with one message page and a next cursor;
2. position near the top;
3. trigger older-page load;
4. verify older messages appear;
5. verify the previously visible content does not jump to the bottom;
6. verify the jump-to-latest control appears when the user is away from the bottom.

Run:

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts
```

Expected: PASS before refactor.

- [ ] **Step 2: Move scroll-local state**

Move from `AgentChat.vue`:

- `messageScroller`
- `showJumpToLatest`
- `followBottom`
- `previousScrollHeight`
- `scrollToBottom`
- `followTextReveal`
- `handleScroll`

Do not move `loadOlder()` itself; it stays in `useAgentConversation()`.

- [ ] **Step 3: Rewire watchers**

`AgentChat.vue` still watches `messages` but delegates bottom-follow behavior through the controller. Session changes call `resetFollowBottom()`.

- [ ] **Step 4: Run tests and typecheck**

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

### Task 6: Replace independent inspector booleans with one panel controller

**Files:**

- Create: `frontend/src/features/conversation/composables/useConversationPanels.ts`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

Export:

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

- [ ] **Step 1: Add a characterization test for mutual exclusivity**

Assert:

- opening Deliverables closes Audit;
- opening a file closes Deliverables and shows preview;
- Escape closes the active inspector;
- only one of preview/deliverables/audit is visible at a time.

Run:

```bash
npm run test:e2e -w frontend -- history-chat-layout.spec.ts -g "inspector"
```

Expected: PASS before refactor.

- [ ] **Step 2: Implement the controller**

Move these responsibilities out of `AgentChat.vue`:

- `activePreview`
- `deliverablesOpen`
- `auditOpen`
- `previewApprovalSubmitted`
- `openFilePreview`
- `openDeliverable`
- `toggleDeliverables`
- `toggleAudit`
- `closeFilePreview`

Use one `panel` discriminated value rather than three booleans.

- [ ] **Step 3: Rewire Escape and preview synchronization**

The global Escape handler calls `closeInspector()`.

Keep the existing watch that refreshes an already-open preview when deliverable approval metadata changes, but read/write through the controller's `activePreview`.

- [ ] **Step 4: Run targeted checks**

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

### Task 7: Extract the conversation header and inspector renderer

**Files:**

- Create: `frontend/src/features/conversation/components/ConversationHeader.vue`
- Create: `frontend/src/features/conversation/components/ConversationInspector.vue`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

`ConversationHeader.vue` props/events:

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

`ConversationInspector.vue` props/events:

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

- [ ] **Step 1: Add stable accessible assertions for header and inspector controls**

Use the existing labels for Record/Deliverables and current ready/running/pending status. Do not assert internal SVG markup.

- [ ] **Step 2: Extract header markup/styles**

Move only the header identity/actions/status UI. `AgentChat.vue` continues to compute the source data.

- [ ] **Step 3: Extract inspector switch markup**

Move the `FilePreviewPanel` / `DeliverablesPanel` / `AuditPanel` conditional block into `ConversationInspector.vue`.

- [ ] **Step 4: Preserve responsive CSS ownership**

Keep grid/container-query layout rules in `AgentChat.vue` because they describe page layout. Move only component-specific header CSS to `ConversationHeader.vue`.

- [ ] **Step 5: Run tests**

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

`ConversationComposer.vue` must not import conversation APIs or `HttpAgent`.

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

Expose methods to the parent:

```ts
focus(): void
setText(text: string): void
clearIfMatches(text: string): void
```

- [ ] **Step 1: Lock composer behavior with E2E**

Required assertions:

- lazy session creation still occurs only on first submit;
- attachment is staged before send;
- running state exposes Stop through XSender cancel behavior;
- pending interrupt disables normal submission and renders `InterruptCard`;
- retry dock invokes retry;
- model selection emits current model.

Run:

```bash
npm run test:e2e -w frontend -- lazy-session.spec.ts core-flows.spec.ts
```

Expected: baseline green after earlier test migration.

- [ ] **Step 2: Extract composer markup and sender ref**

Move:

- `XSender`
- attachment queue
- file button
- `ModelSelector`
- approval dock
- run-recovery dock
- `InterruptCard`
- composer assurance

into `ConversationComposer.vue`.

- [ ] **Step 3: Keep orchestration in `AgentChat.vue`**

`AgentChat.vue` still performs:

- `send()`
- `retry()`
- `resume()`
- `stop()`
- session materialization emit
- error notification

The composer only emits UI intent.

- [ ] **Step 4: Rewire starter prompts and continue-from-step**

Replace direct `senderRef` calls with the exposed composer methods.

- [ ] **Step 5: Run targeted tests and typecheck**

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

### Task 9: Extract the conversation viewport and keep `AgentChat.vue` as orchestrator

**Files:**

- Create: `frontend/src/features/conversation/components/ConversationViewport.vue`
- Modify: `frontend/src/features/conversation/components/AgentChat.vue`
- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/e2e/history-chat-layout.spec.ts`

**Interfaces:**

Props should be presentation data, not runtime clients:

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

- [ ] **Step 1: Add/repair tests for reasoning/tool/final-answer ordering**

Use an AG-UI fixture that streams reasoning, tool call/result, and final text. Assert:

- process group renders before final answer;
- final answer is not swallowed by process grouping;
- streaming pending indicator disappears at finish.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "reasoning|tool|stream"
```

Expected: PASS before extraction.

- [ ] **Step 2: Extract viewport template**

Move:

- loading skeleton;
- welcome state;
- `message-list` rendering;
- `ConversationProcessGroup`;
- `ConversationMessage`;
- `GeneratedArtifactCard`;
- response-pending indicator;
- jump-to-latest button.

- [ ] **Step 3: Keep presentation computation outside**

`AgentChat.vue` still computes:

```ts
const presentationItems = computed(() => buildPresentation(...))
```

The viewport only renders it.

- [ ] **Step 4: Preserve page-level layout CSS**

Do not move `.agent-chat-layout`, `.agent-chat`, or inspector-grid/container-query rules. Move only viewport/welcome/message-list styles that belong to the extracted component.

- [ ] **Step 5: Run regression checks**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts history-chat-layout.spec.ts
npm run typecheck -w frontend
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 6: Review `AgentChat.vue` responsibilities**

After extraction, `AgentChat.vue` should primarily contain:

- runtime/composable wiring;
- derived presentation state;
- semantic action handlers;
- session-change watchers;
- keyboard shortcut orchestration;
- page layout.

If deliverable algorithms, scroll algorithms, or large child templates remain, finish the extraction before committing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/conversation/components/ConversationViewport.vue frontend/src/features/conversation/components/AgentChat.vue frontend/e2e/core-flows.spec.ts frontend/e2e/history-chat-layout.spec.ts
git commit -m "refactor: reduce agent chat to page orchestration"
```

---

### Task 10: Lock generated-UI policy and A2UI action behavior

**Files:**

- Modify: `frontend/e2e/core-flows.spec.ts`
- Modify: `frontend/src/features/conversation/components/GenerativeUiCard.vue` only if comments/deprecation annotation are needed
- Modify: `frontend/src/features/conversation/components/A2uiSurfaceCard.vue` only if stable selectors are needed
- Modify: `frontend/src/a2ui/catalog.ts`
- Modify: `frontend/docs/ag-ui-contract.md`
- Create: `frontend/docs/generated-ui-policy.md`

**Interfaces:**

- Legacy renderer remains: `activityType: dataagent.ui`.
- Canonical generic renderer remains: `activityType: a2ui-surface`.
- `sendA2uiAction(action)` API in `useAgentConversation()` stays unchanged.

- [ ] **Step 1: Add deterministic A2UI E2E**

Fixture must render at least:

- MetricCard;
- DataTable or chart;
- ActionButton.

Assert allowed content is visible and clicking the action causes the next `/agui` body to contain `forwardedProps.a2uiAction`.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "A2UI"
```

Expected: PASS or expose a real action-state defect.

- [ ] **Step 2: Remove fixed six-second ActionButton busy timeout**

Current `ActionButton` in `frontend/src/a2ui/catalog.ts` owns a local six-second busy timer. Replace it with the surrounding run/busy semantics available to the component implementation. If the current `createVueComponent` context cannot expose page run state safely, remove the fake timer and guard duplicate clicks only synchronously; do not invent another arbitrary timeout.

The user-visible busy state must reflect actual run state through `A2uiSurfaceCard :busy` where possible.

- [ ] **Step 3: Document generated-UI routing policy**

Create `frontend/docs/generated-ui-policy.md` with these rules:

1. new generic model-generated UI uses A2UI;
2. `dataagent.ui` remains compatibility-only;
3. do not add new generic metric/table/chart/markdown card kinds to `GenerativeUiCard`;
4. fixed business workflows use explicit Vue components and explicit business semantics;
5. A2UI operations must remain sanitizable/replayable for hydration.

- [ ] **Step 4: Update AG-UI contract docs**

Reference the new policy from `frontend/docs/ag-ui-contract.md` without changing protocol behavior.

- [ ] **Step 5: Run checks**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "A2UI"
npm run typecheck -w frontend
npm run build -w frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/core-flows.spec.ts frontend/src/a2ui/catalog.ts frontend/src/features/conversation/components/A2uiSurfaceCard.vue frontend/src/features/conversation/components/GenerativeUiCard.vue frontend/docs/ag-ui-contract.md frontend/docs/generated-ui-policy.md
git commit -m "docs: establish A2UI-first generated UI policy"
```

---

### Task 11: Align subagent presentation and documentation with the runtime contract

**Files:**

- Modify: `frontend/docs/subagent-visualization.md`
- Modify: `frontend/src/features/conversation/processPresentation.ts`
- Modify: `frontend/src/features/conversation/components/ConversationMessage.vue` only if unmatched subagent activity needs a clearer label
- Modify: `frontend/e2e/core-flows.spec.ts`

**Interfaces:**

Runtime activity type is exactly:

```text
dataagent.subagent
```

The adapter remains responsible for emitting it. Do not introduce nested AG-UI Run lifecycle events.

- [ ] **Step 1: Add a subagent activity E2E fixture**

Emit an unmatched `ACTIVITY_SNAPSHOT` with:

```json
{
  "activityType": "dataagent.subagent",
  "content": {
    "agentId": "sql-agent",
    "name": "SQL Agent",
    "task": "查询最近30天销售趋势",
    "status": "running"
  }
}
```

Assert the activity remains understandable in the process view when no matching standard tool call is present.

Run:

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "subagent"
```

Expected: if current presentation hides or labels it generically, FAIL.

- [ ] **Step 2: Adjust presentation deduplication only as needed**

In `processPresentation.ts`, keep the existing rule that redundant subagent activity may be suppressed when a matching standard tool call already represents the same operation. Do not suppress unmatched `dataagent.subagent` activity.

- [ ] **Step 3: Update the stale contract doc**

Change `frontend/docs/subagent-visualization.md` from `activityType: subagent` to `activityType: dataagent.subagent` and describe current Conversation-first presentation rather than the removed/legacy workspace-only graph assumptions.

- [ ] **Step 4: Run tests and adapter regression**

```bash
npm run test:e2e -w frontend -- core-flows.spec.ts -g "subagent"
npm test -w adapter
npm run typecheck -w frontend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/docs/subagent-visualization.md frontend/src/features/conversation/processPresentation.ts frontend/src/features/conversation/components/ConversationMessage.vue frontend/e2e/core-flows.spec.ts
git commit -m "fix: align subagent presentation contract"
```

---

### Task 12: Final regression, cleanup, and verification record

**Files:**

- Modify: `frontend/docs/BUILD-VERIFICATION.md`
- Delete only if fully superseded: stale E2E test code that still references removed CopilotKit/DynamicWorkspace selectors
- Modify as required: `frontend/e2e/*.spec.ts`

**Interfaces:**

No production interfaces change in this task.

- [ ] **Step 1: Scan for stale architecture markers**

Run:

```bash
grep -R "copilot-chat-input\|data-copilotkit\|dynamic-workspace-shell\|active.v2.session-thread\|dataagent.theme'" frontend/e2e frontend/src || true
```

Expected: no stale E2E/runtime references unless a string is intentionally documented in a migration comment.

- [ ] **Step 2: Scan for new generic legacy generated-UI kinds**

Inspect `GenerativeUiCard.vue` and shared legacy normalization. Confirm this plan did not add new generic metric/table/chart/markdown kinds beyond existing compatibility behavior.

- [ ] **Step 3: Run full project verification**

Run:

```bash
npm test -w adapter
npm run check:offline -w frontend
npm run typecheck -w frontend
npm run build -w frontend
npm run test:e2e -w frontend
npm run build
```

Expected: all commands PASS.

- [ ] **Step 4: Update build verification documentation**

In `frontend/docs/BUILD-VERIFICATION.md`, record:

- Playwright is now an installed/supported frontend check;
- current E2E scenario count;
- Chromium installation requirement for local/CI execution;
- adapter tests/typecheck/build/E2E pass status;
- any remaining bundle-size warning, without claiming it is fixed if it is not.

- [ ] **Step 5: Review diff for scope creep**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~12..HEAD
```

Review that no backend API contract, session endpoint, or unrelated page behavior changed.

- [ ] **Step 6: Commit verification updates**

```bash
git add frontend/docs/BUILD-VERIFICATION.md frontend/e2e
git commit -m "docs: record conversation UI regression baseline"
```

- [ ] **Step 7: Final branch check**

Run:

```bash
npm run test:e2e
npm run check
```

Expected:

- `npm run test:e2e` PASS;
- existing root `npm run check` PASS;
- CI workflow separately runs the browser E2E command.

---

## Task dependency order

Execute tasks strictly in this order:

```text
1 Playwright support/CI
  ↓
2 E2E migration
  ↓
3 correctness fixes
  ↓
4 deliverables extraction
  ↓
5 scroll extraction
  ↓
6 panel-state extraction
  ↓
7 header/inspector extraction
  ↓
8 composer extraction
  ↓
9 viewport extraction
  ↓
10 generated-UI policy
  ↓
11 subagent contract alignment
  ↓
12 full regression/verification
```

Tasks 4–9 intentionally follow the regression-baseline tasks. Do not parallelize multiple `AgentChat.vue` extraction tasks against the same branch because they touch the same orchestration file and will create avoidable conflicts.

Tasks 10 and 11 may be delegated to separate fresh subagents only after Task 9 is merged into the working branch, because both consume the finalized presentation boundaries.

## Review checklist for every task

Before accepting each task:

- Relevant targeted test is green.
- `npm run typecheck -w frontend` is green for production-code tasks.
- No direct `HttpAgent` or API calls were introduced into presentational child components.
- No new generic state library was introduced.
- No copied deliverable/scroll/panel algorithm remains in both the old and new location.
- Public props/events are semantic rather than DOM-library-specific.
- Error handling remains user-visible where it was user-visible before.
- Commit contains only the task's scope.

## Completion criteria

The plan is complete only when:

1. CI installs Chromium and runs `npm run test:e2e -w frontend`.
2. All stale CopilotKit-era E2E assumptions are removed.
3. `AgentChat.vue` is a page orchestrator rather than the owner of deliverable, scroll, panel, composer, and viewport internals.
4. User bubble uses dedicated tokens.
5. Failed model switch rolls back visual selection.
6. Tool warnings show actual details.
7. A2UI is documented/tested as the generic generated-UI extension path.
8. `dataagent.ui` remains backwards-compatible but is not expanded.
9. `dataagent.subagent` is the documented/tested runtime activity type.
10. Adapter tests, frontend offline check, typecheck, build, and E2E all pass.

## Execution handoff

Recommended execution mode: **Subagent-Driven Development**. Dispatch one fresh implementation agent per Task, run the task-specific tests, then perform a review gate before the next Task. Tasks 4–9 should remain sequential because they all modify `AgentChat.vue`.

Alternative: use **Executing Plans** in a separate session/worktree and process tasks in order with checkpoints after Tasks 3, 6, 9, and 12.
