# Data Agent repository guidance

When shaping, editing, or reviewing user-facing UI under `frontend/`, read `/design.md` before writing code.

Use `/design.md` to decide hierarchy, composition, copy, responsive behavior, states, and visual treatment. Then load only the surface contract you need:

- Conversation, history, files, HITL: `frontend/docs/UI-ARCHITECTURE.md`
- AG-UI runtime behavior: `frontend/docs/ag-ui-contract.md`
- Generated UI / A2UI: `frontend/docs/A2UI-ARTIFACT-CONTRACT.md`
- File approval and preview: `frontend/docs/APPROVAL-AND-PREVIEW-CONTRACT.md`

Rules:

- Reuse existing Vue components and the `--da-*` token vocabulary. Do not invent a parallel design system.
- Treat `frontend/src/shared/styles/tokens.css` as the single source of project design tokens and `base.css` as the shared component bridge/refinement layer.
- For generic generated UI, extend the A2UI catalog instead of introducing another rendering protocol.
- Preserve light/dark themes, responsive behavior, focus visibility, reduced motion, and existing AG-UI/HITL semantics.
- Run `npm run check:design -w frontend` plus the relevant typecheck/build/browser tests before declaring UI work complete.
- If review feedback is reusable across surfaces, encode it in `/design.md` and, when mechanical, add or extend a deterministic check. If it is not yet generalizable, record it in `frontend/design-evals/coverage-gaps.md` instead of turning it into a global rule.

Skip this design workflow for backend-only, adapter-only, generated, or documentation-only changes with no user-visible effect.
