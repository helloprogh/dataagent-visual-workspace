# Data Agent style pattern catalog

This catalog is for reproducing Data Agent's visual patterns in another Vue 3 + Element Plus + Element-Plus-X project.

It intentionally does **not** define cross-project class names. Class names, component names and wrapper structure belong to each target project. The exported Vue files under `reference/` show one working implementation, not a naming contract.

For every pattern below, preserve the visual relationship and map it onto the target project's existing components.

## 1. Application shell

**Purpose:** establish a low-noise workspace canvas and a clear separation between navigation and active work.

**Visual recipe:**

- canvas uses `--da-surface-0`;
- navigation uses a nearby but distinguishable semantic surface;
- separation is normally a hairline `--da-border`, not a large shadow;
- sparse blue/cyan/orange ambient glow may orient the active workspace, while ordinary content surfaces remain neutral;
- narrow layouts collapse secondary navigation before reducing primary work to an unusable width.

**Source references:** `reference/App.vue`, `src/shared/styles/app.css`, `src/shared/styles/base.css`.

## 2. Page header

**Purpose:** identify the current page/task without becoming a dashboard banner.

**Visual recipe:**

- concise high-contrast title;
- optional small eyebrow or metadata;
- description uses secondary/muted text;
- actions sit to the side on wide screens and stack on narrow screens;
- thin divider when separation is useful;
- no decorative hero block on operational pages.

**Source reference:** `src/shared/styles/app.css`.

## 3. Primary chat/query/command input

**Element-Plus-X fit:** `XSender` when the target product has a chat/query/command input.

**Visual recipe:**

- `--da-surface-2` background;
- large radius from the canonical scale;
- thin cyan → blue → orange signature edge;
- restrained resting shadow;
- stronger cyan/blue/orange focus glow instead of permanent animation;
- primary text and caret tokens;
- auxiliary controls compact and quiet;
- submit/send remains visually obvious;
- reduced-motion path removes decorative transition dependence.

**Source references:** `reference/components/ConversationComposer.vue`, `src/shared/styles/base.css`.

The target project should implement this recipe using its own wrapper names and DOM structure.

## 4. Compact secondary selector

**Element Plus fit:** `ElSelect`.

**Purpose:** expose model/mode/context without competing with the primary input or CTA.

**Visual recipe:**

- intrinsic/content width when context allows;
- transparent or quiet resting background;
- compact radius, pill-like only when the control is genuinely chip-sized;
- muted selected text;
- subtle hover/focus fill and hairline boundary;
- dropdown content preserves primary/secondary text hierarchy.

**Source reference:** `reference/components/ModelSelector.vue`.

## 5. User-authored / selected-content bubble

**Element-Plus-X fit:** Bubble/message primitive.

**Visual recipe:**

- background uses `--da-bubble-user-bg`;
- boundary uses `--da-bubble-user-border`;
- normal primary text;
- avoid large solid-primary or generic gray chat bubbles.

**Source reference:** `reference/components/ConversationMessage.vue`.

## 6. Primary result / answer

**Purpose:** keep useful output ahead of execution metadata.

**Visual recipe:**

- generous readable width;
- minimal container decoration unless content has a real semantic boundary;
- hierarchy from typography and spacing before card chrome;
- embedded evidence may use a dedicated evidence surface;
- prose should not automatically become a card.

**Source reference:** `reference/components/ConversationMessage.vue`.

## 7. Evidence surface

**Element Plus fit:** `ElCard`, `ElTable`, dialogs/drawers, or plain Vue containers according to semantics.

**Use:** charts, tables, file previews, structured analysis, comparisons.

**Visual recipe:**

- `--da-surface-1` or `--da-surface-2`;
- `--da-border` hairline boundary;
- `--da-radius-md` / `--da-radius-lg` according to scale;
- `--da-shadow-card` or no shadow at rest;
- clear title/context before decorative treatment;
- primary accent reserved for selected/actionable state;
- avoid grids of unrelated equal-weight cards.

## 8. Diagnostic / execution detail

**Element Plus fit:** collapse/details, status/tag primitives, plain code blocks.

**Use:** reasoning, tool activity, raw payloads, logs, execution traces.

**Visual recipe:**

- compact summary affordance;
- muted typography;
- raw payloads use `--da-surface-code`;
- bounded height with scrolling for long content;
- semantic green/red only for real success/error meaning;
- diagnostics stay visually below the primary result.

**Source reference:** `reference/components/ConversationMessage.vue` and source styles.

## 9. Attachment / removable chip

**Element Plus fit:** tag/chip/button composition.

**Visual recipe:**

- compact height;
- semantic surface + thin border;
- pill geometry is appropriate;
- remove action compact and discoverable;
- long names truncate safely rather than expanding the whole input area.

## 10. Primary and secondary actions

**Element Plus fit:** `ElButton`.

Primary action:

- `--da-accent-primary` fill;
- `--da-text-on-accent` text;
- modest radius;
- stronger hover/active tone;
- no large permanent glow.

Secondary action:

- neutral/transparent background;
- semantic border or hover fill;
- quieter text at rest;
- visible focus state.

Icon action:

- compact hit target;
- subdued rest state;
- stronger hover/focus state;
- avoid toolbars filled with always-on saturated icons.

## 11. Sidebar / navigation

**Element Plus fit:** menu/tree/list primitives as appropriate.

**Visual recipe:**

- navigation is lower contrast than active content;
- active item uses primary accent sparingly;
- selected state should be readable without a saturated full-width block;
- metadata/time/counts remain secondary;
- collapsed state preserves icon meaning and focusability.

**Source reference:** `reference/components/ConversationSidebar.vue`.

## 12. Status

Use semantic colors only for semantic meaning:

- primary blue: active/current/running selection;
- green: success/completed/healthy;
- yellow: warning/attention/risk;
- red: failure/destructive/error;
- neutral gray/surface treatment: idle/queued/secondary.

State must not depend on hue alone; pair color with text, icon, shape or placement.

## 13. Empty and loading states

Empty state:

- explain the next action;
- use restrained dashed/border treatment when a container is useful;
- avoid large decorative marketing illustrations by default.

Loading state:

- preserve page structure where possible;
- use Element Plus skeleton/loading primitives before inventing a custom system;
- avoid replacing the entire workspace if only one region is loading.

## 14. Responsive composition

- primary task/result/input keeps priority;
- navigation and secondary inspector collapse/move first;
- evidence may stack or scroll deliberately;
- controls remain reachable;
- do not rely on desktop-only spacing or hover;
- preserve the same token and geometry language across widths.

## 15. Replication rule

The target project does **not** need to copy Data Agent class names. It should preserve:

1. the canonical token vocabulary;
2. Element Plus / Element-Plus-X component choices when semantics match;
3. the visual relationships in this catalog;
4. dark/light behavior;
5. interaction hierarchy and accessibility states.

Use exported Vue source only to inspect how these patterns were realized in the source project.