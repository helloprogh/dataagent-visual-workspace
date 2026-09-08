# Design guidance coverage gaps

Use this file for unresolved product-design questions that are not yet stable enough to become global rules in `/design.md`.

Current gaps:

- Exact density thresholds for large A2UI tables/charts before the surface should switch to a dedicated preview/inspector treatment.
- Final narrow-screen behavior for every inspector subtype; current guidance defines priority but not one universal breakpoint/layout.
- A repeatable visual-regression capture harness is not yet part of CI. The current loop freezes scenarios and runs deterministic source/browser checks, while subjective before/after review remains manual.
- Copy guidance is product-level but does not yet define a complete bilingual terminology glossary for every DA domain concept.

When one of these decisions becomes repeatable through shipped examples or recurring review feedback, move the accepted rule into `/design.md` and add a deterministic check when feasible.
