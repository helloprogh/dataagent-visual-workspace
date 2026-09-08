# Design evaluation loop

These fixtures keep Data Agent's design guidance testable instead of treating `design.md` as a one-time prompt.

## What stays frozen

Each entry in `scenarios.json` fixes the surface, task, viewport, theme, review dimensions, and known failure modes. When evaluating a design rule or UI implementation, do not rewrite the scenario to make the new result pass. Add a new scenario only for a new product surface or failure class.

## Review loop

1. Read `/design.md` and choose every affected scenario ID.
2. Capture/render the existing behavior with the scenario's fixed task, viewport, theme, and mock data/state.
3. Make one coherent design-rule or implementation change.
4. Run `npm run check:design -w frontend`, typecheck/build, and relevant browser tests.
5. Capture/render the same scenario again.
6. Human-review task framing, hierarchy, composition, copy, density, and whether evidence supports the user's decision.
7. Keep, revise, or revert the change. Re-run all scenarios touched by a reusable rule.

## What CI can judge

`check:design` intentionally covers mechanical invariants only: the design guidance/eval manifest exists, the shared stylesheet load order is stable, `--da-*` token references resolve, canonical tokens stay centralized, and key text/surface pairs keep their established contrast floor.

CI cannot decide whether a composition is good, whether the right evidence dominates, or whether a generated UI feels detached from the conversation. Those remain review judgments and must be recorded in the PR evidence.

## Feeding review back

Repeated accepted feedback belongs in `/design.md`. If the same issue can be detected mechanically, extend `frontend/scripts/design-guard.mjs` or `contrast-check.mjs`. If the team has not yet established a reusable answer, record it in `coverage-gaps.md` instead of inventing a global rule.
