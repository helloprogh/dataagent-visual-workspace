# Data Agent portable design kit

This directory is the framework-neutral layer for reproducing the **visual style** of Data Agent in another frontend repository.

It deliberately does **not** export Data Agent product behavior, AG-UI semantics, A2UI runtime contracts, Vue components, or Element Plus internals. Those remain project-specific.

## What to copy

Run from the repository root:

```bash
npm run design:export
```

The command writes a self-contained bundle to:

```text
frontend/dist/dataagent-design-kit/
```

The bundle contains:

- `tokens.css` — exact dark/light semantic tokens copied from the canonical project source.
- `portable.css` — framework-neutral recipes for surfaces, cards, actions, inputs, composer, bubbles, status and diagnostic content.
- `visual-dna.md` — the portable design judgment layer: hierarchy, density, color balance, shape, motion and anti-patterns.
- `style-profile.json` — machine-readable style fingerprint for coding agents and migration tooling.
- `AGENTS.snippet.md` — a short rule that can be merged into another repository's `AGENTS.md`.
- `replication-evals.json` — fixed cross-project scenarios used to judge whether the new UI still feels like Data Agent.
- `manifest.json` — SHA-256 hashes for bundle contents.

## Recommended adoption levels

### Level 1 — visual tokens

Use when the target project already has a strong component library.

1. Copy `tokens.css`.
2. Map the target component library to the semantic tokens.
3. Read `visual-dna.md` before changing component geometry.
4. Review both dark and light themes.

This gives the target project Data Agent's color, spacing, radius, elevation and motion language without importing Vue or Element Plus.

### Level 2 — visual recipes

Use when the target project needs stronger visual similarity.

In addition to Level 1:

1. Copy `portable.css`.
2. Apply the `.da-kit-*` recipes to representative surfaces or translate them into the target project's CSS conventions.
3. Preserve the signature composer, thin-border surface hierarchy, quiet secondary controls and restrained semantic status colors.

The classes are reference recipes, not a required runtime dependency. React CSS Modules, Tailwind, styled-components, Svelte styles, CSS-in-JS or another system may translate them while preserving the same values and relationships.

### Level 3 — agent-guided replication

Use when coding agents will continue evolving the target UI.

In addition to Levels 1–2:

1. Merge the rule in `AGENTS.snippet.md` into the target repository.
2. Copy `visual-dna.md`, `style-profile.json` and `replication-evals.json` into a stable design directory.
3. Ask the agent to map the target project's component library to the Data Agent semantic tokens rather than copying Data Agent Vue markup.
4. Keep fixed replication scenarios stable while iterating.
5. Promote repeated review feedback into the target project's own design guidance.

## What not to copy

Do not copy these just to obtain the style:

- `frontend/src/a2ui/`
- `frontend/src/agui/`
- conversation runtime composables
- Element Plus / Element-Plus-X selectors from `shared/styles/base.css`
- product-specific HITL, session, file-delivery or tool behavior

Those are implementation and product semantics, not visual DNA.

## Fidelity rule

For another project to count as a successful replication, it should preserve the **relationships**, not necessarily the exact DOM:

- dark graphite/navy surfaces with a cool blue primary action;
- cyan and orange as sparse signature accents rather than constant decoration;
- thin low-contrast boundaries before heavy elevation;
- compact operational density with clear primary/supporting/diagnostic hierarchy;
- medium rounded geometry rather than pill-heavy or sharp enterprise chrome;
- a calm default state with stronger glow/gradient only at focus or signature moments;
- semantic green/yellow/red used only for meaning;
- the same style functioning in both light and dark themes.

If the target UI uses the same hex values but violates these relationships, it is not a faithful replication.
