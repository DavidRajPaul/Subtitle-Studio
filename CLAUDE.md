# Claude Instructions — Subtitle Studio

## Source of truth
Read README.md, the product and architecture documents, docs/IMPLEMENTATION_PLAN.md, and the UX documents before architectural or interface changes. Flag conflicts instead of silently choosing.

## Engineering rules
- Implement one phase at a time; inspect the repository before editing.
- Keep the app runnable and changes focused.
- Keep media processing local; no cloud ASR, telemetry, accounts or uploads.
- Bind backend to 127.0.0.1 by default.
- Keep timing logic pure and tested; use integer milliseconds.
- Use one subtitle model for preview, project files, SRT and rendering.
- Never overwrite source media; validate output before success.
- Run FFmpeg with argument arrays; never shell-concatenate user input.
- Clean only app-owned temp paths; review package/model/font licenses.
- MCP is not a runtime dependency for transcription/rendering.

## UX rules
Read docs/UX_STRATEGY.md, docs/UX_FLOWS.md, docs/UI_DESIGN_SYSTEM.md, docs/UX_WIREFRAMES.md, docs/UX_IMPLEMENTATION_PLAN.md and docs/CLAUDE_UX_ADDENDUM.md.
- Phone is the current review device; maintain a usable single-column phone layout.
- Do not compress the desktop three-panel editor onto a phone.
- Timing must be editable numerically, not only by dragging.
- Timing modes explain their behavior; regeneration cannot silently erase manual edits.
- Use accessible labels, visible focus, keyboard support and touch targets around 44 CSS pixels.
- Every loading, empty, error, success and save-failed state needs a clear next action.
- Prioritize usability and timing correctness before decorative effects.

## Required workflow
1. State phase and acceptance criteria.
2. List assumptions and expected files.
3. Implement only approved scope.
4. Add/update tests and docs.
5. Run available formatting, lint, type-check and tests.
6. Report exact commands and actual results; never claim unrun tests passed.
7. Summarize changes, limitations and next task.
8. Stop for human smoke testing after each phase.

## Product invariants
- Equal, readable-duration, fit-to-video and manual timing remain distinct.
- Overlap warnings do not auto-move/delete subtitles.
- If timing constraints conflict, warn instead of silently making text unreadable.
- Original media remains unchanged.
- Core workflows require no cloud service after local dependencies/models are installed.

## First task
Inspect branch, repository files and working-tree state. Preserve existing work. Implement Phase 0 only from docs/IMPLEMENTATION_PLAN.md, then stop for review before Phase 1.
