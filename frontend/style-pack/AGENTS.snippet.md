# Frontend design and architecture guidance

For meaningful user-facing frontend work in this repository, read the imported guidance before writing code:

- `frontend-architecture-guidance.md` for project structure, dependency direction, state/API/component boundaries, testing and engineering constraints.
- `pattern-catalog.md` for Data Agent visual patterns and how to map them onto Vue + Element Plus + Element-Plus-X components.
- `source-design.md` when the change needs deeper hierarchy/composition/design judgment.
- `replication-evals.json` for fixed visual review cases.

Rules:

- Keep business/domain code feature-owned. Do not grow giant root `components`, `services`, `utils` or global stores without a real cross-feature need.
- Use the narrowest state scope that works. Keep server/remote state authoritative and derive presentation state instead of synchronizing duplicate copies.
- Put endpoint/transport/normalization logic behind typed feature API modules; do not scatter raw requests through Vue components.
- Use composables for independent async/resource/lifecycle behavior, not as a place to hide a God component.
- Prefer Element Plus for normal application controls and Element-Plus-X only for genuinely conversational/AI interaction patterns.
- Use the copied `tokens.css` as the canonical `--da-*` vocabulary. Do not create a second palette, spacing or radius system.
- Keep `tokens.css -> base.css -> app.css` import order and central theme initialization.
- Map visual patterns onto the target project's own component/class names. Do not rename target components or CSS classes merely to match Data Agent source code.
- Use exported Vue source under `reference/` as implementation evidence, not as business-code templates to bulk copy.
- Keep secondary controls quiet, primary actions blue, and cyan/orange accents sparse.
- Preserve dark/light themes, keyboard focus, reduced motion, semantic status colors and diagnostic-content hierarchy.
- Do not import Data Agent runtime/business behavior merely to copy its look or architecture.
- Avoid adding an OSS dependency when Vue, browser APIs, Element Plus/Element-Plus-X, or a small local abstraction already solves the need clearly.
- For meaningful changes, run typecheck/build plus relevant unit/browser checks; CI is authoritative for merge readiness.
- Review the fixed cases in `replication-evals.json` after meaningful style changes.
