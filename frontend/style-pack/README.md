# Data Agent same-stack frontend kit

This kit is for reproducing Data Agent's frontend **visual style and engineering approach** in another project using the same stack:

- Vue 3
- TypeScript
- Vite
- Element Plus
- Element-Plus-X where conversational/AI UI is needed
- vue-router / vue-i18n as applicable
- native ECharts when charts are needed

Because the stack is the same, the preferred strategy is direct reuse of the shipped style/theme layer plus reusable architecture guidance. The target project keeps its own business components, class names, state, routes and backend contracts.

## One-command export

From the repository root:

```bash
npm run export:frontend-kit
```

`npm run export:style-pack` remains as a compatibility alias.

This writes a copy-ready directory to:

```text
frontend/dist/dataagent-frontend-kit/
```

## Exported contents

### Canonical style/theme files

These are copied directly from the live source project:

```text
src/shared/styles/tokens.css
src/shared/styles/base.css
src/shared/styles/app.css
src/shared/styles/index.css
src/shared/theme/theme.ts
```

The source project remains the source of truth. The kit never maintains a second handwritten copy of these files.

### Development guidance

```text
guidance/frontend-architecture-guidance.md
guidance/pattern-catalog.md
guidance/source-design.md
guidance/AGENTS.snippet.md
guidance/replication-evals.json
```

Responsibilities:

- `frontend-architecture-guidance.md` — feature-first structure, dependency direction, component/composable/API/state boundaries, library usage, performance, testing and architecture anti-patterns.
- `pattern-catalog.md` — semantic visual patterns such as application shell, primary input, user message, evidence surface and diagnostic content.
- `source-design.md` — deeper Data Agent hierarchy/composition/design judgment.
- `AGENTS.snippet.md` — short entry point to merge into another repository's agent guidance.
- `replication-evals.json` — fixed review cases for visual fidelity.

### Reference Vue implementation

The exporter also includes selected current source files under `reference/`:

```text
reference/main.ts
reference/App.vue
reference/components/AgentMark.vue
reference/components/ConversationSidebar.vue
reference/components/ConversationHeader.vue
reference/components/ConversationComposer.vue
reference/components/ConversationMessage.vue
reference/components/ModelSelector.vue
reference/source-ui-architecture.md
```

These files are **reference-only**. They let coding agents inspect how the accepted UI is implemented with Vue, Element Plus and Element-Plus-X.

They are not a cross-project naming or DOM contract. The target project should not rename classes/components merely to match them and should not bulk-copy their business logic.

## Why same-stack replication is different

A high-fidelity replica needs more than palette values, but it also does not need source-project class names.

The reusable layers are:

1. **semantic tokens** — color, surfaces, text, spacing, radius, elevation and motion;
2. **framework mapping** — how Element Plus / Element-Plus-X are visually adapted in the shared style bridge;
3. **visual patterns** — relationships for primary input, navigation, evidence, diagnostics, messages and actions;
4. **architecture rules** — how Vue features, composables, APIs, state and shared code are organized;
5. **reference source** — concrete examples when the target agent needs to see a working implementation.

Target-project class names are implementation details and are intentionally excluded from the portable contract.

## Target-project installation

### 1. Check stack compatibility

The export includes `peer-stack.json`, generated from the current source `frontend/package.json`.

Use compatible Vue / Element Plus / Element-Plus-X versions where practical. Exact version matching is not mandatory, but major library DOM/style changes may require adapting `base.css`.

### 2. Copy the canonical style/theme layer

Recommended target structure:

```text
src/
├─ shared/
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ base.css
│  │  ├─ app.css
│  │  └─ index.css
│  └─ theme/
│     └─ theme.ts
```

### 3. Keep global import order

Equivalent to the source project:

```ts
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './shared/styles/index.css'
```

Initialize the theme before mounting:

```ts
import { initializeTheme } from './shared/theme/theme'

initializeTheme()
```

Use `reference/main.ts` to compare plugin/import order when the target project has additional setup.

### 4. Adapt shared bridge scoping deliberately

The source `base.css` scopes many overrides under `.dataagent-app`. The target project has two valid options:

- keep that root scope if adopting the styles with minimal changes; or
- replace the root scope consistently with the target project's own application root class.

Do not treat `.dataagent-app` or any other source class name as a portable requirement.

If the target root scope changes, update `base.css` once at the shared layer rather than patching each component.

### 5. Map semantic patterns, not class names

Read `guidance/pattern-catalog.md` and map each relevant pattern to the target project's existing components.

Example: for a primary `XSender`, reproduce the same surface, gradient-edge, focus-glow, auxiliary-action and token relationships using the target wrapper/classes. The target wrapper does not need to be named `.agent-chat__composer`.

### 6. Follow the frontend architecture guidance

Read `guidance/frontend-architecture-guidance.md` before adding significant frontend structure.

The default architecture is feature-first:

```text
app → features → shared
```

with feature-local `api/`, `components/`, `composables/`, `pages/` and types.

The target product keeps its own domains and business boundaries; copy the architectural rules, not Data Agent feature names.

### 7. Use source references selectively

When a target component has a close equivalent:

1. inspect the target component first;
2. inspect the nearest file under `reference/`;
3. compare Element Plus / Element-Plus-X primitive choice and interaction states;
4. map the visual pattern into target-owned markup/classes;
5. keep target props, API, routing, state and i18n semantics;
6. copy source scoped CSS only when it represents a genuinely reusable visual rule not already covered by the shared style layer.

## Adoption modes

### Full frontend replication

Use when another project should strongly resemble Data Agent and follow the same engineering conventions.

Adopt:

- canonical style/theme files;
- architecture guidance;
- pattern catalog;
- AGENTS snippet;
- relevant reference Vue files;
- replication evals.

### Visual-only replication

Use when the target project already has a sound architecture.

Adopt:

- tokens/styles/theme;
- pattern catalog;
- source design guidance;
- visual references/evals.

Do not force the target project to reorganize merely for visual similarity.

### Architecture-only reuse

Use when the target design is different but the team wants the same frontend engineering approach.

Adopt `frontend-architecture-guidance.md` and adjust the UI-library/style sections to the target design system.

## What not to copy

Do not copy these merely to obtain style or architecture:

- AG-UI runtime behavior;
- A2UI protocol handling;
- conversation/session business state;
- HITL semantics;
- Data Agent file-delivery rules;
- target-irrelevant API modules;
- Data Agent class/component names as mandatory conventions.

## Agent workflow in the target repository

Merge `guidance/AGENTS.snippet.md` into the target repo's existing agent guidance.

For meaningful frontend work, the coding agent should:

1. identify the owning feature and source of truth;
2. inspect existing target code before creating abstractions;
3. read the architecture guidance for code boundaries;
4. read the pattern catalog/source design for visual changes;
5. use Element Plus / Element-Plus-X primitives when semantics match;
6. use canonical tokens instead of inventing a parallel style system;
7. preserve target-owned component/class names and business semantics;
8. handle loading/error/empty/disabled/focus/responsive/theme states;
9. add tests at the lowest useful layer plus E2E for critical integration;
10. use `replication-evals.json` for significant visual changes;
11. treat CI as authoritative for completion.

## Fidelity test

A same-stack visual replica should preserve:

- surface hierarchy and border contrast;
- text hierarchy and operational density;
- blue primary action with restrained cyan/orange signature accents;
- consistent Element Plus / Element-Plus-X adaptation;
- signature primary input treatment where applicable;
- quiet secondary/icon controls;
- subtle user/selected-content tint;
- diagnostic content visually below primary results;
- equivalent light/dark behavior;
- reduced motion and visible keyboard focus.

It does **not** need to preserve Data Agent class names.

Use `guidance/replication-evals.json` as the fixed visual review set and `guidance/frontend-architecture-guidance.md` as the engineering review baseline.
