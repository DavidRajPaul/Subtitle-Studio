# Subtitle Studio — End-to-End Implementation Plan

**Status:** Planned · **Implementation partner:** Claude

## Delivery strategy
Build a local-first desktop web app with responsive phone layouts. Prioritize the TXT path early because it exercises segmentation, timing, editing and preview without requiring speech-model setup. Add local transcription and then export. Every phase must keep the app runnable, add tests, update docs and pass a human smoke test.

## Phases
0. **Foundation:** React/TypeScript/Vite, FastAPI, configuration, diagnostics, lint/type-check/test scripts. Exit: clean setup and health checks pass.
1. **Import/preview:** MP4 picker, FFprobe metadata, video playback/seek. Exit: valid video plays; errors are actionable.
2. **TXT/timing:** UTF-8 import, line/paragraph/sentence segmentation, equal/readable/fit/manual modes, interval validation. Exit: deterministic tests pass.
3. **Editor:** cue list, numeric timing, timeline, styles, synchronized overlay, local project save/load. Exit: manual cue edits and project round-trip work.
4. **Speech:** faster-whisper adapter, embedded audio or external MP3, background jobs/progress, editable transcript. Exit: speech sample produces editable cues locally.
5. **Export:** UTF-8 SRT, FFmpeg burn-in, progress and output validation. Exit: both workflows export valid SRT and playable MP4.
6. **Hardening:** failure paths, cancellation, safe temp cleanup, licensing, regression and clean-install tests. Exit: all P0 acceptance scenarios pass.
7. **Post-MVP:** autosave, undo/redo, presets, alignment, waveform, effects, Tauri or mobile only when justified.

## UX implementation phases
Use [UX_IMPLEMENTATION_PLAN.md](UX_IMPLEMENTATION_PLAN.md) alongside engineering phases. UX work is not a separate throwaway mockup; it must use the same canonical project, timing and style state as the implemented features.

## Claude phase protocol
Read README, CLAUDE.md, relevant architecture/product docs and UX docs. Inspect repository state; state scope and acceptance criteria; implement only the current phase; add tests/docs; run checks and report exact commands/results; list limitations; stop for human review and commit before proceeding. Do not claim tests or visual reviews that were not actually performed.

## Definition of done
The phase's acceptance gate passes, app remains runnable, tests/docs are updated, source media is safe and the owner has reviewed the behavior. Generated code is not the same as a verified feature.
