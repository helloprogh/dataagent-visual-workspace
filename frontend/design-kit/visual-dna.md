# Data Agent visual DNA

This file describes the visual identity that should survive when Data Agent's style is reproduced in a different frontend stack.

It is narrower than the repository `/design.md`: this file governs **appearance and composition**, not Data Agent runtime/product semantics.

## 1. Overall character

The interface should feel like a focused technical workspace rather than a generic SaaS dashboard.

Key traits:

- calm, dark graphite/navy foundation;
- precise rather than decorative;
- compact but not cramped;
- strong information hierarchy with quiet supporting chrome;
- thin boundaries and layered surfaces before large shadows;
- cool blue as the main action color;
- cyan and orange as sparse signature accents;
- restrained motion and glow;
- readable in long-running analytical work.

The style should feel capable and modern without becoming neon, gaming-like, glass-heavy or card-heavy.

## 2. Color relationship

Use semantic tokens from `tokens.css`; do not reconstruct the palette manually.

### Foundation

- `--da-surface-0` is the workspace canvas.
- `--da-surface-1` and `--da-surface-2` create primary content elevation.
- `--da-surface-3` and `--da-surface-4` are stronger interaction/elevation states, not default card fills everywhere.
- Borders remain low contrast and become stronger only for focus or meaningful separation.

### Primary action

`--da-accent-primary` is the dominant interactive color. It should carry selection, primary CTA, active navigation and keyboard/action emphasis.

Do not introduce a second competing primary hue.

### Signature accents

Cyan and orange create Data Agent's recognizable accent tension.

Use them for:

- signature gradients;
- focus/glow moments;
- small orientation details;
- selected visual emphasis where a neutral or primary-blue treatment is insufficient.

Do not spread cyan/orange across every card, badge, title and chart.

### Semantic status

Green, yellow and red are semantic, not decorative:

- green = completed/success/healthy;
- yellow = warning/attention/pending risk;
- red = failed/destructive/error.

Neutral/running states should remain mostly neutral or primary blue.

## 3. Surface model

Prefer a shallow hierarchy:

```text
workspace canvas
  └─ primary surface
      └─ content / semantic subsection
```

Avoid repeated card-inside-card boundaries.

A typical surface uses:

- semantic background token;
- 1px-equivalent hairline border;
- medium radius;
- little or no shadow at rest;
- stronger border/shadow only on interaction or meaningful elevation.

Spacing and typography should usually create grouping before another border does.

## 4. Geometry

The shape language is softly technical:

- small radius for controls and compact technical content;
- medium radius for cards/panels;
- larger radius for important floating or input surfaces;
- pills only for chips, compact state, model selection, or naturally pill-shaped controls;
- circles only for icon actions/status marks.

Do not turn every action or container into a pill.

Use the spacing scale from `tokens.css`. Prefer the established 4/8/12/16/20/24/32/40 rhythm rather than one-off gaps.

## 5. Typography

Use a neutral sans-serif/system stack. The style does not depend on a proprietary typeface.

Hierarchy comes from:

1. placement and available width;
2. size;
3. weight;
4. spacing;
5. color, last.

Typical behavior:

- body content: `--da-font-size-md`;
- compact controls/metadata: `--da-font-size-xs` or `--da-font-size-sm`;
- section heading: `--da-font-size-lg` / `--da-font-size-xl`;
- large hero type is rare and should not dominate operational screens.

Primary text should remain highly readable. Supporting text can recede but should not become low-contrast decoration.

## 6. Density and hierarchy

The UI is operational and information-rich, but the answer/action currently needed should be easy to identify.

Use three visual levels:

- **Primary:** current task/result/action. Highest text contrast and best width.
- **Supporting:** metadata, evidence, filters, secondary actions. Smaller/quieter.
- **Diagnostic:** logs, raw payloads, reasoning, IDs. Compact and subdued, often collapsible.

Do not give all three levels the same card weight, typography, or color intensity.

## 7. Signature components

These are the strongest portable style cues.

### Composer / primary input surface

The composer is a signature interaction surface:

- raised `surface-2` background;
- larger radius;
- subtle brand-gradient border;
- calm default shadow;
- cyan/blue/orange glow increases on focus rather than constantly animating;
- auxiliary actions are compact and muted;
- primary send action remains obvious.

In non-chat products, this recipe can be reused for the primary command/search/query surface.

### User/selected-content bubble

Use a lightly primary-tinted surface with a subtle primary border. It should be distinguishable without becoming a bright blue block.

### Evidence card

Tables, charts, files and analysis cards should usually use:

- `surface-1` or `surface-2`;
- hairline border;
- medium radius;
- restrained card shadow;
- clear title/context;
- no decorative gradient unless the content itself calls for it.

### Diagnostic block

Logs/code/raw details use the code surface, smaller text, compact spacing and strong readability. They should feel technical but subordinate.

## 8. Controls

Primary button:

- blue fill;
- white/on-accent text;
- modest radius;
- stronger hover/active tone;
- no large permanent glow.

Secondary button:

- neutral surface or transparent background;
- border or hover fill as needed;
- muted text at rest;
- clear focus ring.

Icon control:

- compact square/circle hit area;
- subdued rest state;
- stronger hover/focus state;
- avoid filling toolbars with always-visible colored icons.

## 9. Motion

Motion is short and functional.

Default timing should track `--da-motion-fast` and `--da-ease-out`.

Use motion for:

- focus/hover transition;
- panel/page entry;
- meaningful state changes;
- controlled streaming/progress indication.

Avoid:

- continuous decorative shimmer;
- large parallax;
- bouncing controls;
- animated gradients everywhere;
- motion required to understand status.

Honor `prefers-reduced-motion`.

## 10. Light theme

Light mode is not a white inversion of dark mode.

It should retain:

- slightly warm/cool soft canvas rather than clinical pure-white everywhere;
- white primary surfaces;
- crisp but restrained borders;
- the same blue primary action;
- reduced glow strength;
- subtle user-message tint;
- the same hierarchy and geometry.

Do not make the light theme visually unrelated to the dark theme.

## 11. Responsive behavior

When space decreases:

- preserve the primary task first;
- collapse/move navigation and inspectors before crushing content;
- stack secondary surfaces deliberately;
- allow evidence to scroll when shrinking it would destroy meaning;
- retain minimum touch/control sizes;
- do not remove focus/semantic state just to save space.

## 12. Anti-patterns

A replication is drifting away from Data Agent if it shows several of these:

- every section is a floating card;
- default surfaces use strong shadows;
- gradients are used as general backgrounds rather than signature accents;
- all statuses use saturated unrelated colors;
- huge marketing hero typography appears in operational screens;
- excessive glass blur/transparency lowers readability;
- border radii vary arbitrarily;
- spacing uses many one-off values;
- secondary toolbar controls are as loud as the primary action;
- dark and light modes use unrelated visual rules;
- copying exact colors while ignoring hierarchy/density/composition.

## 13. Replication acceptance

A target frontend is visually faithful when a reviewer can recognize the same style from:

- surface layering;
- action hierarchy;
- accent restraint;
- geometry;
- information density;
- focus treatment;
- dark/light relationship;
- diagnostic-content treatment;

without needing Data Agent-specific labels, icons, components, or runtime behavior.
