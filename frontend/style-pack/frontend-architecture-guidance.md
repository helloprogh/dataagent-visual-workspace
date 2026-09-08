# Frontend architecture guidance

This document is a reusable architecture baseline for frontend projects using the same core stack as Data Agent:

- Vue 3
- TypeScript
- Vite
- Element Plus
- Element-Plus-X where conversational/AI interaction is needed
- vue-router
- vue-i18n when the product is multilingual
- native ECharts for charts when needed

It is intentionally product-neutral. It guides code organization and engineering decisions without importing Data Agent's AG-UI, A2UI, session, HITL, file-delivery or backend semantics.

Normative words:

- **MUST**: default architecture rule; exceptions need an explicit reason.
- **SHOULD**: preferred rule; deviations are acceptable when the local design is clearly better.
- **MAY**: optional.
- **DO NOT**: prohibited default because it creates recurring maintenance problems.

## 1. Architecture goal

Optimize for these properties in order:

1. feature ownership is obvious from the directory tree;
2. UI components are easy to understand without reading API/runtime code;
3. asynchronous behavior has one source of truth;
4. shared code is truly cross-feature rather than prematurely generalized;
5. framework/library integration is thin and replaceable;
6. user-visible behavior is testable through stable product semantics;
7. visual consistency comes from shared tokens/patterns rather than copied CSS.

Prefer simple explicit boundaries over infrastructure created "for future reuse".

## 2. Recommended source structure

Use feature-oriented organization:

```text
src/
├─ app/
│  ├─ App.vue
│  └─ ...app-shell-only code
├─ router/
│  ├─ index.ts
│  └─ routes.ts              # optional when routes become large
├─ features/
│  ├─ <feature-a>/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ composables/
│  │  ├─ pages/
│  │  ├─ types.ts
│  │  └─ utils/              # only when feature-local helpers justify it
│  └─ <feature-b>/
├─ shared/
│  ├─ api/
│  ├─ components/            # only genuinely cross-feature components
│  ├─ composables/
│  ├─ config/
│  ├─ styles/
│  ├─ theme/
│  ├─ types/
│  └─ utils/
├─ i18n/
├─ main.ts
└─ env.d.ts
```

Rules:

- **MUST** place business/domain code under the owning feature.
- **DO NOT** create one giant root `components/`, `services/`, `utils/` or `hooks/` directory for unrelated features.
- **SHOULD** keep `app/` limited to application composition: providers/plugins, global layout, route outlet and truly global behavior.
- **MUST NOT** put feature API calls, feature state machines or large business workflows in `App.vue`.
- Move code to `shared/` only after at least two features need the same abstraction and the semantics are actually identical.

## 3. Dependency direction

Prefer this dependency direction:

```text
app
  ↓
features
  ↓
shared
```

Within a feature:

```text
page/orchestrator
  ↓
components + composables
  ↓
feature api/types/utils
  ↓
shared api/config/utils
```

Rules:

- `shared/` **MUST NOT** import from `features/`.
- Feature A **SHOULD NOT** import internal implementation files from Feature B.
- If two features need the same capability, extract a stable shared abstraction or expose a small public feature API instead of deep-importing internals.
- UI library wrappers **SHOULD** stay close to the UI layer; API/domain modules should not depend on Element Plus or Element-Plus-X.
- Backend response normalization **SHOULD** happen near the API/runtime boundary, not repeatedly inside templates.

## 4. Page, orchestrator and component responsibilities

### Page components

A page MAY:

- read route params/query;
- coordinate feature-level composables;
- choose major layout/surfaces;
- pass data and semantic event handlers to child components.

A page SHOULD NOT:

- contain large data-normalization pipelines;
- directly implement low-level request details in many handlers;
- own hundreds of lines of reusable visual markup;
- reach into third-party component instances to implement business behavior.

### Orchestrator/container components

For a complex surface, use one orchestration layer that:

- owns composition of runtime state/composables;
- translates UI events into domain actions;
- derives only lightweight view-facing state;
- delegates large semantic regions to child components.

When one component owns transport, persistence, derivation, scrolling, layout, dialogs, keyboard shortcuts and rendering, split responsibilities before adding more features.

### Presentational/semantic components

Components SHOULD:

- receive explicit typed props;
- emit semantic events such as `submit`, `retry`, `open-preview`, `approve`, not DOM-oriented events such as `button-clicked`;
- avoid direct API calls unless the component itself is the complete feature boundary;
- avoid duplicating state already owned by a parent/composable;
- keep scoped styles near the component when those styles are surface-specific.

## 5. Composables

Use composables for reusable or independently testable behavior, especially:

- async resource loading;
- pagination;
- selection/state transitions;
- scroll/focus behavior;
- file/input behavior;
- derived presentation state;
- browser lifecycle integration.

A composable SHOULD have one clear responsibility.

Prefer:

```ts
useConversationScroll()
useAsyncResource()
useSelection()
useAttachments()
```

Avoid a single `useEverythingForPage()` composable that simply moves a God component into another file.

Rules:

- **MUST** clean up timers, listeners, observers, streams and abortable requests on scope disposal.
- **SHOULD** expose semantic methods and refs rather than third-party component instances.
- **MUST NOT** create a second copy of authoritative remote/runtime state only to make templates convenient.

## 6. State management

Use the narrowest state scope that works.

Order of preference:

1. component-local `ref` / `reactive`;
2. feature composable shared by the owning page/surface;
3. URL/router state when state is navigational/shareable;
4. persisted browser storage only for durable user preference/draft identity;
5. Pinia or another global store only when state is truly cross-route/cross-feature and has a clear lifecycle.

Do not add a global store merely because multiple nested components need the same value; props/events or a feature composable may be the correct boundary.

Rules:

- Remote/server state **MUST** remain server-authoritative unless the product explicitly supports offline-first mutation.
- Persisted values **MUST** have versioned keys or migration strategy when their schema can change.
- Derived state **SHOULD** be computed from source state rather than independently synchronized.
- Avoid watchers that copy one reactive value into another without adding semantics.

## 7. API layer

Each feature SHOULD have a small typed API layer:

```text
features/<feature>/api/
```

The API layer owns:

- endpoint construction;
- request/response transport details;
- abort signal plumbing;
- normalization of inconsistent backend envelopes;
- typed errors when useful.

Components/pages own:

- loading/error presentation;
- user retry decisions;
- whether old data is retained during refresh;
- optimistic UI only when explicitly designed.

Rules:

- **DO NOT** scatter raw `fetch()` calls across Vue components.
- **MUST** support `AbortSignal` for user navigation, superseded requests or unmount where meaningful.
- For latest-request-wins resources, use a request generation/id or cancellation so stale responses cannot overwrite newer state.
- **DO NOT** hide transport failures by silently fabricating successful product state.

## 8. Async resource pattern

For ordinary list/detail resources, standardize these states:

```text
idle → loading → success
             ↘ error
```

Decide explicitly whether refresh failure:

- clears previous data; or
- preserves previous data and exposes a warning.

Both can be correct; accidental inconsistency is not.

For concurrent refreshes:

- newer requests win;
- old responses are ignored or aborted;
- unmounted scopes do not publish state;
- loading belongs to the current request, not whichever request finishes first.

## 9. Router

Use `vue-router` as the source of truth for navigation-relevant state.

- Routes SHOULD lazy-load page-level modules unless the app is trivially small.
- Query/path params SHOULD represent states users may refresh, bookmark or navigate back to.
- Feature-local transient UI state (open tooltip, local tab with no navigation meaning) should not be forced into the URL.
- Route synchronization MUST avoid feedback loops between watchers and router updates.
- Navigation should not trigger mutation APIs merely because a component mounted.

## 10. Internationalization

When i18n is enabled:

- user-visible reusable copy MUST come from locale resources;
- avoid hardcoded Chinese/English strings inside reusable components;
- error objects/API codes should be translated at the presentation boundary, not inside low-level transport utilities unless the backend contract requires it;
- tests SHOULD set locale explicitly when asserting text;
- keys SHOULD describe product meaning, not DOM position (`approval.confirm`, not `rightButtonText`).

## 11. Element Plus usage

Element Plus is the default general-purpose component system.

Prefer built-in primitives for:

- buttons;
- inputs/selects;
- dialogs/drawers/popovers;
- tables/forms;
- skeleton/loading;
- messages/notifications;
- accessibility-heavy controls.

Rules:

- **DO NOT** rebuild a common control with custom DOM/CSS unless the product interaction cannot be expressed cleanly with the library.
- Apply project visual tokens through the shared style bridge rather than customizing every instance.
- Keep teleported overlay token mapping in global/shared style scope.
- Avoid relying on undocumented internal DOM when a public class/slot/API can solve the need.

## 12. Element-Plus-X usage

Use Element-Plus-X when the interaction is genuinely conversational/AI-oriented, such as:

- sender/composer;
- bubbles/messages;
- welcome/start surfaces;
- AI-specific interaction primitives that match the product need.

Rules:

- **DO NOT** use Element-Plus-X merely to make a normal CRUD page "AI styled".
- Wrap third-party primitives with project semantics when behavior becomes non-trivial.
- Business/runtime state belongs in composables/domain code, not in visual X components.
- Project styles may target library implementation details inside a controlled shared bridge, but feature code should depend on project semantics rather than third-party DOM where possible.

## 13. Styling architecture

Use three levels:

```text
tokens.css  → semantic design values
base.css    → framework/component-library bridge + cross-feature refinements
app.css     → generic application/page layout recipes
component scoped style → feature/surface-specific layout
```

Rules:

- canonical semantic tokens MUST be declared in one place;
- shared component-library overrides belong in the shared bridge, not repeated across feature components;
- feature-specific layout remains with its owner;
- avoid new literal colors when a semantic token exists;
- avoid one-off spacing/radius values when an established scale fits;
- `!important` is a last resort for third-party cascade integration, not a normal component styling technique.

For reproducing the Data Agent style, use the exported Style Pack and `pattern-catalog.md`; target project class names remain target-owned.

## 14. Theme

Theme switching SHOULD be centralized.

A theme module owns:

- initial preference resolution;
- document root theme attribute/class;
- persistence;
- application-wide reactive theme value if needed.

Components SHOULD react through semantic tokens rather than branching on `dark/light` for individual colors.

Only branch on theme in component logic when behavior/assets genuinely differ.

## 15. Charts

When charts are required, prefer native ECharts integration unless the target project already has a justified wrapper abstraction.

A chart wrapper/composable SHOULD own:

- ECharts instance creation;
- resize handling;
- option updates;
- disposal on unmount;
- theme-sensitive recreation/update when needed.

Do not introduce another chart wrapper dependency solely to avoid a small lifecycle abstraction.

Charts must not encode important meaning through color alone.

## 16. TypeScript

- Public props/emits/composable returns SHOULD be typed explicitly.
- Normalize `unknown` backend data near the boundary.
- Avoid `any` in templates/presentation code as a permanent escape hatch.
- Prefer domain types over generic dictionaries once a contract is understood.
- Avoid type duplication between API, state and component layers when one shared feature type expresses the same meaning.
- Do not use TypeScript complexity to simulate a framework; readable types are preferred over clever meta-types.

## 17. Dependency policy

Keep the dependency set small.

Before adding a package, ask:

1. Does Vue / browser platform / Element Plus / Element-Plus-X already solve this?
2. Can a small maintained utility/composable solve it clearly?
3. Is the dependency actively maintained and tree-shakeable?
4. Does it introduce a second competing UI/state/network abstraction?
5. Will it materially reduce code or correctness risk?

Do not add an OSS package for a few lines of deterministic local logic.

Avoid parallel frameworks for the same responsibility (for example two UI component systems or two generic generated-UI systems) unless there is a deliberate migration plan.

## 18. Performance

Default performance rules:

- lazy-load route-level pages;
- dynamically import heavy optional features where useful;
- abort superseded network requests;
- avoid deep watchers on large message/table datasets;
- derive maps/indexes with `computed` when repeated lookup cost matters;
- virtualize only after measuring a real large-list problem;
- keep streaming updates incremental and avoid rebuilding unrelated large subtrees;
- dispose observers, chart instances and event listeners;
- preserve scroll position intentionally during pagination/prepend operations.

Optimize measured bottlenecks, not hypothetical ones.

## 19. Accessibility

- interactive controls MUST be keyboard reachable;
- focus-visible state MUST remain visible;
- icon-only actions MUST have accessible names;
- status MUST NOT rely on color alone;
- dialogs/popovers SHOULD use library primitives with correct focus management;
- reduced motion MUST be respected;
- semantic HTML is preferred over clickable generic `div`s;
- disabled/loading behavior should be perceivable and prevent accidental duplicate actions.

## 20. Responsive behavior

Build responsiveness around semantic priority, not only breakpoints.

When width decreases:

1. preserve the primary task/content/input;
2. collapse/move navigation;
3. collapse/move inspector/secondary panels;
4. stack supporting controls;
5. allow evidence to scroll when shrinking would destroy meaning.

Do not make mobile/narrow mode a separate visual system.

Prefer `rem`, `clamp()`, CSS grid/flex and container queries where they improve component ownership.

## 21. Error handling

Errors should be handled at the layer that can make the right decision.

- Transport layer: normalize status/body and throw useful errors.
- Feature composable: determine resource state/retry semantics.
- UI: communicate what failed and the next action.

Avoid generic success-looking fallback data after a real failure.

For destructive mutations:

- explicit confirmation where consequence warrants it;
- disable duplicate submission;
- preserve recovery path;
- refresh or reconcile authoritative state after success.

## 22. Testing strategy

### Static/type checks

MUST cover:

- TypeScript/Vue typecheck;
- production build;
- project-specific deterministic architecture/style checks when established.

### Unit/contract tests

Prefer for:

- normalization;
- request ordering/stale-response protection;
- state transitions;
- pure derived data;
- protocol/schema helpers.

### Browser/E2E

Use for user-critical flows and integration boundaries:

- routing and session/page restoration;
- primary submit flows;
- async error/retry;
- dialogs/approval/destructive actions;
- theme behavior;
- critical responsive behavior;
- library integration that cannot be trusted from static tests alone.

E2E selectors SHOULD use stable product-owned semantics (`data-testid`, role/name, stable labels), not third-party internal class names.

CI is authoritative for merge readiness.

## 23. Component size / extraction signals

Do not enforce arbitrary line-count limits, but split a component when multiple signals appear:

- it owns more than one independent async lifecycle;
- it contains several large semantic regions;
- unrelated watchers/effects accumulate;
- scrolling/focus/panel state is mixed with runtime/business state;
- the same derived logic is needed elsewhere;
- tests need to manipulate third-party internals to reach business behavior;
- a reviewer cannot state the component's responsibility in one sentence.

Extract by responsibility, not by moving random template fragments into tiny files.

## 24. Architectural anti-patterns

### God page / God component

One file owns transport, state, derivation, layout, all dialogs, all keyboard behavior and rendering.

**Correction:** separate runtime/resource composables and semantic child components while keeping one orchestration boundary.

### Shared dumping ground

Everything reusable-looking is moved into `shared/` before a second use exists.

**Correction:** keep code feature-local until semantics are proven shared.

### Global-store reflex

Every value goes to Pinia/global state.

**Correction:** use the narrowest state scope and keep server state authoritative.

### Watcher synchronization graph

Many watchers copy state between refs, route, storage and child components.

**Correction:** establish one source of truth and derive the rest.

### Component-library bypass

Common buttons/forms/dialogs are rebuilt manually for styling reasons.

**Correction:** use Element Plus / Element-Plus-X and solve branding in the shared style layer.

### API calls in templates/components everywhere

Each component constructs endpoints and parses backend envelopes.

**Correction:** feature API boundary + typed/normalized return values.

### Framework abstraction for its own sake

A custom internal component/state/network framework is built on top of Vue and Element Plus without concrete repeated need.

**Correction:** prefer thin conventions and normal Vue primitives.

## 25. New-feature workflow for coding agents

For a meaningful new frontend feature, follow this order:

1. Identify the owning feature and user-visible responsibility.
2. Inspect existing components/composables/API modules that solve adjacent problems.
3. Decide the source of truth and async lifecycle before building UI.
4. Add/extend feature types and API boundary.
5. Implement orchestration/composable behavior.
6. Build UI using Element Plus / Element-Plus-X primitives and existing style patterns.
7. Keep target-project naming and business semantics; do not copy source-project names blindly.
8. Add error/loading/empty/disabled/focus states.
9. Add tests at the lowest layer that proves the behavior, plus E2E for critical integration.
10. Run typecheck, build, deterministic checks and relevant browser tests.
11. Review architecture: no new duplicated state, deep feature imports, avoidable dependency or repeated styling system.

## 26. Definition of done

A frontend change is not complete merely because the happy path renders.

For meaningful work, verify as applicable:

- typed public boundary;
- loading / empty / error states;
- async cancellation or stale-response safety;
- keyboard/focus accessibility;
- dark/light appearance;
- responsive priority;
- no duplicated authoritative state;
- no unnecessary new dependency;
- correct feature/shared ownership;
- relevant tests and production build pass;
- visual changes follow the project's design guidance/style pack.
