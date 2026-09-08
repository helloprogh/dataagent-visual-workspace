# Data Agent style replication guidance

For user-facing UI work in this repository, preserve the imported Data Agent style pack before inventing new visual rules.

Read the copied style-pack `README.md` and `component-contract.md` before editing Vue components that use Element Plus or Element-Plus-X.

Rules:

- Use the copied `tokens.css` as the canonical `--da-*` vocabulary. Do not create a second palette or spacing/radius system.
- Keep the `.dataagent-app` root scope around the styled application.
- Keep `tokens.css -> base.css -> app.css` import order.
- Prefer existing Element Plus / Element-Plus-X primitives and retain the project-owned style hooks documented in `component-contract.md`.
- Reuse the signature `.agent-chat__composer` wrapper when the target product has a primary chat/query/command input built with Element-Plus-X XSender.
- Keep secondary controls quiet, primary actions blue, and cyan/orange accents sparse.
- Preserve dark/light themes, keyboard focus, reduced motion, semantic status colors and diagnostic-content hierarchy.
- Do not import Data Agent runtime/business behavior merely to copy its look.
- When a target-specific need conflicts with this style pack, preserve the target product's semantics first and adapt the visual rule explicitly rather than silently forking the token system.
- Review the fixed cases in `replication-evals.json` after meaningful style changes.
