# Data Agent same-stack style pack

This pack is for reproducing Data Agent's UI style in another frontend that uses the same stack:

- Vue 3
- Vite
- Element Plus
- Element-Plus-X
- TypeScript

Because the stack is the same, the preferred strategy is **direct reuse of the shipped styling layer**, not a framework-neutral rewrite.

## One-command export

From the repository root:

```bash
npm run export:style-pack
```

This writes a copy-ready directory to:

```text
frontend/dist/dataagent-style-pack/
```

The exported pack contains the current canonical styles/theme implementation plus integration guidance and selected reference Vue files.

## What is canonical

The source project remains the source of truth. Do not manually maintain duplicate style files in `style-pack/`.

The exporter copies these live files:

```text
frontend/src/shared/styles/tokens.css
frontend/src/shared/styles/base.css
frontend/src/shared/styles/app.css
frontend/src/shared/styles/index.css
frontend/src/shared/theme/theme.ts
```

This matters because the style is produced by the combination of:

1. semantic `--da-*` tokens;
2. Element Plus / Element-Plus-X bridge selectors in `base.css`;
3. shared page/layout recipes in `app.css`;
4. the `.dataagent-app` root scope;
5. dark/light theme initialization in `theme.ts`;
6. stable class hooks around Element-Plus-X components.

Copying only the colors will not reproduce the project accurately.

## Reference Vue files

The exporter also places selected current source files under `reference/`:

```text
reference/main.ts
reference/App.vue
reference/components/AgentMark.vue
reference/components/ConversationSidebar.vue
reference/components/ConversationHeader.vue
reference/components/ConversationComposer.vue
reference/components/ConversationMessage.vue
reference/components/ModelSelector.vue
```

These are **reference-only**. They exist so another coding agent can see the exact Element Plus / Element-Plus-X structure, project-owned class hooks, shell background, density, spacing and responsive decisions that generated the accepted UI.

Do not bulk-copy their business logic into the target project. Adapt the target project's existing components and keep its own state/API/i18n semantics.

## Target-project installation

Keep the target project's own application architecture. Copy only the styling layer first.

### 1. Keep compatible dependencies

Use compatible versions of Vue 3, Element Plus and Element-Plus-X. The exporter writes a `peer-stack.json` snapshot from the source project's current `package.json` so the target repo can see the versions the style pack was validated against.

### 2. Copy the exported files

A recommended target structure is:

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

### 3. Use the same global import order

Before the app mounts, import:

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

Compare with the exported `reference/main.ts` when the target project already has additional plugins.

### 4. Add the root scope

The target application's user-facing shell should have:

```html
<main class="dataagent-app">...</main>
```

`base.css` deliberately scopes most framework overrides under `.dataagent-app` so the style does not leak into unrelated host content.

### 5. Preserve stable style hooks

Read `guidance/component-contract.md` before adapting chat/input/message components. These hooks are intentionally part of the same-stack visual contract.

For example, an Element-Plus-X sender wrapped by `.agent-chat__composer` receives the current gradient border, background, focus glow and auxiliary-action treatment without copying those rules into the component.

### 6. Use references to adapt, not replace

When a target component has an equivalent source reference:

1. compare its Element Plus / Element-Plus-X primitive;
2. compare wrapper class names and structure;
3. copy the stable visual hook when semantics match;
4. keep the target component's props, API calls, state and route behavior;
5. only copy scoped CSS if the behavior is truly visual and not already supplied by shared `base.css`/`app.css`.

This produces much higher fidelity than prompting an agent from screenshots while avoiding a fork of Data Agent business code.

## Adoption modes

### Full visual replication

Use when the target product should look recognizably like Data Agent.

Copy all exported style/theme files, preserve the class contract, use the same Element Plus / Element-Plus-X primitives where equivalent functionality exists, and use the exported Vue files as structural references.

### Shared brand, different product layout

Use when the target app has different information architecture.

Reuse `tokens.css`, `base.css`, theme initialization, buttons/inputs/surface conventions and the signature input treatment, but keep the target project's own layout. Use the exported `guidance/source-design.md` principles for hierarchy rather than copying Data Agent page structure blindly.

## What not to copy for style alone

Do not copy AG-UI runtime, A2UI protocol handling, conversation state, session APIs, HITL semantics or delivery behavior just to obtain the visual style.

A target project can reproduce the style while having completely different business behavior.

## Agent workflow in the target repository

Merge `guidance/AGENTS.snippet.md` into the target repo's existing agent guidance and provide the exported pack as the style source.

For UI changes, the coding agent should:

1. inspect the existing target component before replacing it;
2. inspect the closest exported Vue reference when one exists;
3. use the exported `--da-*` tokens instead of inventing a palette;
4. use Element Plus / Element-Plus-X primitives before rebuilding controls;
5. preserve the stable class hooks where the matching source style exists;
6. check dark and light themes;
7. compare against `guidance/replication-evals.json` instead of judging from one screenshot;
8. keep product semantics from the target project rather than importing Data Agent behavior.

## Fidelity test

A same-stack replica should preserve all of these:

- surface hierarchy and border contrast;
- text hierarchy and operational density;
- blue primary action with restrained cyan/orange signature accents;
- Element Plus controls remapped into the Data Agent token system;
- the signature Element-Plus-X composer treatment when a primary input exists;
- quiet secondary/icon controls;
- user/selected-content tint instead of a heavy gray or solid-primary block;
- diagnostic/tool content remaining visually subordinate;
- equivalent light/dark theme behavior;
- reduced-motion and visible keyboard focus.

Use `guidance/replication-evals.json` as the fixed review set.
