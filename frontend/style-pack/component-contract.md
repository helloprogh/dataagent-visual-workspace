# Same-stack component style contract

`frontend/src/shared/styles/base.css` contains deliberate selectors for Element Plus and Element-Plus-X. In another Vue + Element Plus + Element-Plus-X project, these class hooks are the compatibility layer that lets the same CSS reproduce the same style.

They are **visual contracts**, not business/runtime contracts.

## Root

### `.dataagent-app`

Required around the user-facing application that should inherit Data Agent styling.

Responsibilities inherited from `base.css`:

- Element Plus semantic color mapping;
- text/background/border token mapping;
- shared button behavior;
- scrollbars;
- focus visibility;
- global component refinements.

Do not remove this scope and then copy all selectors globally.

## Application/page layout

From `app.css`:

- `.app-layout`
- `.app-sidebar`
- `.app-main`
- `.app-page`
- `.app-page__inner`
- `.app-page__header`
- `.app-page__eyebrow`
- `.empty-state`

These are reusable for ordinary management/detail pages in the same stack. A target product may keep its own layout, but if it uses these classes it should preserve their semantic purpose.

## Conversation/header

### `.agent-chat__header`

Used for a compact conversation/workspace header. The shared style keeps it quiet, compact and secondary to the active work.

Do not use this hook for a marketing hero or general page header.

## Element-Plus-X composer

The strongest signature contract is:

```html
<div class="agent-chat__composer-wrap">
  <div class="agent-chat__composer">
    <!-- Element-Plus-X XSender -->
  </div>
</div>
```

`base.css` styles Element-Plus-X sender implementations beneath `.agent-chat__composer`, including known library classes:

- `.elx-x-sender`
- `.elx-xsender`
- `.x-sender`

The hook supplies:

- surface-2 input background;
- signature cyan → blue → orange border;
- rounded geometry;
- restrained resting shadow;
- stronger focus glow;
- content/caret colors;
- reduced-motion handling.

If the target project also uses XSender, keep this wrapper contract rather than copying the internal library selectors into feature components.

## Composer actions

### `.composer-input-actions`

Use for the compact auxiliary-action group inside/below the primary sender.

Direct child Element Plus buttons become circular quiet icon actions. Primary submit/send action may still use the library's primary action treatment.

## Model selection

### `.model-selector`

Use around the compact Element Plus `ElSelect` that chooses a model or equivalent low-priority execution mode.

The style intentionally makes it quieter than the message input and submit action.

If another product has no model concept, this hook can be reused only for an equivalent compact secondary selector; do not add a selector just to mimic the screenshot.

## User/selected-content bubble

### `.message-bubble--user`

The shared style maps Element-Plus-X bubble background/border to:

- `--da-bubble-user-bg`
- `--da-bubble-user-border`

Use this for user-authored or selected-input content that needs distinction without a saturated primary fill.

## Attachments/chips

- `.attachment-queue`
- `.attachment-chip`

Use for files or compact removable objects associated with the primary input. The styles are deliberately pill-like because chips are one of the few places where pill geometry is appropriate.

## Process / diagnostic details

Under `.process-step__content`, `base.css` recognizes:

- `.reasoning-card`
- `.reasoning-card--running`
- `.reasoning-content`
- `.tool-call`
- `.tool-result-card`
- `.tool-mark`
- `.tool-mark--success`
- `.tool-mark--error`

These hooks produce the source project's diagnostic hierarchy: compact summaries, subdued technical content, semantic success/error marks, and bounded raw payload areas.

A target project can reuse these hooks for build logs, query traces, workflow diagnostics or execution details even when it has no agents.

## Preview/workspace width

### `.agent-chat-layout--preview`

This hook increases the secondary preview panel while preserving usable primary conversation width.

Only reuse it when the target page has the same two-context relationship (primary work + evidence/preview). Do not use it as a generic two-column grid.

## Welcome content

### `.agent-welcome`

Contains small Element-Plus-X Welcome refinements. Reuse only for an action-oriented empty/start state, not a decorative landing page.

## Stability policy

The hooks above should be treated as stable while this Style Pack exists.

When changing `base.css`:

1. prefer maintaining these project-owned wrappers even if Element-Plus-X internal selectors change;
2. add new project-owned hooks for new reusable visual patterns;
3. avoid exposing more third-party internal DOM than necessary;
4. update this contract when a stable hook changes;
5. run `npm run check:design` and browser regression before shipping.

Third-party selectors such as `.elx-x-sender` are implementation details inside the wrapper contract; target projects should depend on the project-owned wrapper class, not on those selectors alone.
