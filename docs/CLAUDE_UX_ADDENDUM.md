# Claude UX Implementation Addendum

Before implementing UI, read:
- docs/UX_STRATEGY.md
- docs/UX_FLOWS.md
- docs/UI_DESIGN_SYSTEM.md
- docs/UX_WIREFRAMES.md
- docs/UX_IMPLEMENTATION_PLAN.md

Rules:
1. Implement one UX phase at a time and keep the app runnable.
2. Mobile is the user's current review device; every phase must be usable at phone width, even though the product's primary editor is desktop-first.
3. Do not squeeze the desktop three-panel layout onto a phone. Use a single-column flow and bottom sheets for timing/style.
4. Numeric time editing must always be available; drag-only editing is unacceptable.
5. The video preview must use canonical subtitle timing and style state.
6. Timing modes must explain their outcomes before applying them; regeneration must not silently discard manual edits.
7. Every loading, empty, error, success, offline/model-missing and save-failed state must offer a clear next action.
8. Use accessible labels, visible focus, keyboard support and touch targets around 44 CSS pixels.
9. Avoid implementing decorative effects before usability, timing correctness and export reliability.
10. After each phase, list files changed, run available checks, report actual results, and provide a concise mobile smoke-test checklist. Never claim a visual test was performed unless it actually was.

Suggested first UX task: implement UX Phase A only after the code foundation exists. If the app foundation has not been implemented, do not build disconnected mock screens; coordinate the UX shell with implementation Phase 0.
