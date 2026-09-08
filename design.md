# Data Agent design guidance

This file is the design judgment layer for Data Agent. It exists so coding agents and human contributors can make user-facing changes without re-inventing the product's visual language or information hierarchy from screenshots and local CSS alone.

The implementation follows the same three-layer idea described in Vercel's `design.md` workflow:

1. **Judgment in this file** — what the reader is trying to do, what should dominate, what should stay quiet, and which generated-design failure modes to avoid.
2. **A bounded implementation vocabulary** — the existing `--da-*` tokens, Element Plus / Element Plus X bridge styles, and approved Vue/A2UI components.
3. **An evaluation loop** — frozen UI scenarios, human review for hierarchy/composition, and deterministic checks for rules that can be automated.

Canonical references:

- Method: https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md
- UI architecture: `frontend/docs/UI-ARCHITECTURE.md`
- Tokens: `frontend/src/shared/styles/tokens.css`
- Shared component refinements: `frontend/src/shared/styles/base.css`
- Fixed design scenarios: `frontend/design-evals/scenarios.json`

This file governs user-facing product UI. Runtime protocol semantics remain owned by the AG-UI/A2UI contract documents.

## 1. Reader job before visual treatment

Data Agent is conversation-first. The interface should help a data professional move a request from intent to analysis/development to review and delivery without losing the thread of the conversation.

Before changing a surface, identify the reader's immediate job:

- **Chat:** understand the latest answer and decide what to say or approve next.
- **Execution details:** inspect reasoning/tool progress only when needed; debug information is secondary to the result.
- **HITL:** understand exactly what decision is required, what will happen after approval, and how to revise or cancel.
- **Generated UI:** compare evidence or interact with a result; it should support the answer rather than become a detached dashboard.
- **Deliverables / preview:** inspect the artifact, version, and approval state without losing conversation context.
- **History:** find and reopen work quickly; session management must not compete with active work.
- **Skills / tools:** understand availability, health, and actions; operational detail should be scannable rather than decorative.

When two elements compete, the element that advances the reader's current decision gets priority.

## 2. Information hierarchy

Use a three-level hierarchy.

### Primary

The current task, latest assistant result, required approval, or active artifact. It receives the clearest typography and the most useful width.

### Supporting

Evidence, charts, tables, file metadata, model identity, status, and secondary actions. Keep it visible but quieter than the primary result.

### Diagnostic

Reasoning traces, tool payloads, raw errors, execution metadata, and protocol details. Keep them discoverable, collapsible where appropriate, and visually subordinate.

Do not promote diagnostic content merely because it is verbose or technically interesting.

## 3. Composition rules

### Conversation

- Keep the conversation column visually continuous. Avoid turning every message, tool result, or status into an equally weighted card.
- User messages should be distinct but not louder than assistant answers. Use the dedicated user bubble tokens.
- Reasoning and tool execution belong to the answer process, not a second timeline competing with the answer.
- The composer is the dominant persistent action. Auxiliary controls stay quiet until hovered/focused or needed.
- The header provides identity and state, not a dashboard. Do not duplicate execution steps at the top of the conversation.

### Inspector and deliverables

- Open preview/deliverable/audit content beside the conversation when width allows. Preserve conversation continuity.
- Give evidence-heavy content the width it needs. Tables, charts, file previews, and structured comparisons should not be squeezed to prose width when a wider panel is available.
- Do not nest panels for decoration. A surface should have one clear container boundary unless nesting communicates a real semantic relationship.

### Generated UI / A2UI

- Generic generated UI uses the existing A2UI catalog. Do not add a second generic component protocol.
- Generated UI must answer a concrete question: compare, inspect, choose, approve, explain, or act.
- Prefer one strong composition over a grid of unrelated cards.
- Charts and tables are evidence. Add titles/labels/context that make the claim understandable without relying on color alone.
- Fixed business workflows may remain explicit Vue components when they have stable product semantics; generic display composition belongs in A2UI.

### Empty and loading states

- Empty states explain what the user can do next. Avoid decorative hero content that delays the first action.
- Loading states should preserve layout and context rather than replace the whole workspace when possible.
- Streaming should make progress legible without causing layout jumps or repeatedly stealing scroll position.

## 4. Bounded visual vocabulary

Do not reconstruct the visual system from arbitrary values in component CSS.

### Canonical token families

Use `frontend/src/shared/styles/tokens.css`:

- Text: `--da-text-emphasis`, `--da-text-primary`, `--da-text-secondary`, `--da-text-muted`, `--da-text-subtle`, `--da-text-link`, `--da-text-on-accent`
- Surfaces: `--da-surface-0` through `--da-surface-4`, plus sidebar/input/code/hover/active variants
- Borders/focus: `--da-border`, `--da-border-strong`, `--da-border-focus`, `--da-focus-outline`, `--da-ring-accent`
- Actions/status: `--da-accent-primary` and hover/active/soft variants; green/yellow/red semantic tokens
- Brand accents: cyan/blue/orange/glow/gradient tokens; use sparingly for orientation and focus, not as decoration on every container
- Typography: `--da-font-size-*`
- Spacing: `--da-space-*`
- Radius: `--da-radius-*`
- Layout: sidebar/content width tokens
- Elevation/motion: `--da-shadow-*`, `--da-motion-fast`, `--da-ease-out`

If a reusable semantic value is missing, add it to `tokens.css` for both themes when appropriate. Do not define new `--da-*` variables inside feature components.

### Shared component layer

`frontend/src/shared/styles/base.css` is the bridge between Data Agent tokens and Element Plus / Element Plus X. Put cross-surface refinements there only when they genuinely apply across features. Keep surface-specific layout in the owning component.

### Theme behavior

- Every new surface must work in dark and light themes.
- Prefer semantic tokens over literal colors so theme behavior is inherited.
- Status meaning cannot depend on hue alone; pair color with text, icon, shape, or placement.
- Preserve readable focus and selection states.

## 5. Typography and copy

- Use the existing application font stack. Do not introduce a one-off typeface for a feature.
- Create hierarchy with size, weight, spacing, and placement before introducing color.
- Titles state what the user is looking at; descriptions explain why it matters or what to do next.
- Buttons use explicit verbs: `Approve delivery`, `Retry`, `Open preview`, `Stop`, not vague labels such as `Continue` when the action is specific.
- Error copy explains the next useful action when one exists.
- Avoid agent-centric narration such as describing internal framework steps when the user only needs the outcome.
- Keep technical identifiers available for audit/debug surfaces, not as the default human label.

## 6. Interaction and state

Every interactive control must account for:

- default
- hover when hover exists
- keyboard focus
- active/pressed where relevant
- disabled
- loading/running
- success/completed where meaningful
- error/rejected where meaningful

For async actions, prevent ambiguous duplicate submission. Preserve the user's input or recovery path when an operation fails.

HITL decisions are explicit product states. Approval, cancellation, and revision must remain visible and must not be represented only as a tool call or toast.

## 7. Responsive behavior

- The active task remains primary as the viewport narrows.
- Collapse or move secondary navigation/inspectors before reducing the conversation to an unusable width.
- Evidence surfaces may become horizontally scrollable or stack deliberately; do not silently truncate important values.
- Use existing rem/clamp/container-query patterns where they fit the owning surface.
- Test a desktop width and a narrow width for meaningful UI changes.

## 8. Accessibility and motion

- Preserve semantic controls and accessible names from Element Plus / Element Plus X unless there is a strong reason to override them.
- Keep keyboard focus visible.
- Do not encode state only through color.
- Maintain sufficient readable contrast for primary and secondary content.
- Respect `prefers-reduced-motion`; decorative transitions must not be required to understand state.
- Large motion should communicate navigation or state change, not decorate routine streaming updates.

## 9. Named failure modes

Naming recurring failures makes them easier to detect in review.

### Generic SaaS dashboard

Symptoms: unrelated KPI cards, equal-weight panels, a decorative hero, and charts that are not tied to the user's current question.

Correction: restore the conversation/task as the primary frame and keep only evidence that advances the current decision.

### Panel nesting

Symptoms: card inside card inside bordered section; every group gets radius, border, and shadow.

Correction: use spacing and typography first; add a container boundary only when it communicates ownership, state, or interaction.

### Gradient confetti

Symptoms: gradients/glows used on headers, cards, badges, buttons, charts, and backgrounds simultaneously.

Correction: reserve brand gradients/glow for focus, orientation, or a small number of signature moments. Most surfaces should use semantic surface tokens.

### Status rainbow

Symptoms: each runtime state receives an unrelated saturated color and the page becomes a legend.

Correction: keep neutral states neutral; reserve semantic green/yellow/red for success/warning/error meaning and pair them with text/icon treatment.

### Debug-first hierarchy

Symptoms: tool names, payloads, run IDs, reasoning, and protocol states appear before the user-facing result.

Correction: result first, supporting process second, raw diagnostics on demand.

### Detached generated UI

Symptoms: A2UI content looks like a separate application or dashboard with no visible relationship to the answer that produced it.

Correction: make the generated surface support a specific claim/action in the conversation and reuse the same token/component vocabulary.

### One-theme styling

Symptoms: literal colors or shadows look acceptable in dark mode but become weak, muddy, or inaccessible in light mode (or vice versa).

Correction: use semantic tokens and review both themes before shipping.

## 10. Evaluation loop

Design guidance changes are treated like code changes.

1. Select the affected frozen scenario(s) in `frontend/design-evals/scenarios.json`.
2. Keep the scenario prompt, mock data, viewport, and theme fixed while comparing the old and new guidance/implementation.
3. Run deterministic checks first: `npm run check:design -w frontend`, typecheck, relevant build/E2E.
4. Human review judges the parts automation cannot: task framing, hierarchy, composition, copy, information density, and whether the reader gets the answer/action they came for.
5. Encode accepted reusable feedback as a rule here. If the failure is mechanical, add a deterministic guard so it cannot quietly return.
6. Re-run every scenario affected by that rule; a rule that improves one surface can regress another.
7. At larger milestones, compare against the previous accepted version rather than only reviewing the latest output in isolation.

Do not change a frozen scenario merely to make a new rule look better. Add a new scenario when a genuinely new surface or failure class needs coverage.

## 11. Review evidence

For a user-facing PR, include:

- surfaces changed
- relevant section(s) of this file
- frozen scenario IDs reviewed
- dark/light and responsive states checked when applicable
- deterministic commands run
- any reusable review feedback added back to this file or to `coverage-gaps.md`

A design rule is not considered established merely because it sounds reasonable. Prefer rules backed by repeated product review, an existing shipped pattern, or a failure reproduced by the fixed scenarios.
