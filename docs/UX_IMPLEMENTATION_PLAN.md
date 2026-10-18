# Subtitle Studio — UX Implementation Plan

**Purpose:** turn the UX documentation into a coherent, testable interface without blocking the MVP.

## UX Phase A — Foundation and navigation
- Implement AppShell, responsive breakpoints, project header and save status.
- Build Home with two workflow cards.
- Add empty/loading/error/success components.
- Establish semantic tokens, keyboard focus, typography and touch-target baseline.
- Acceptance: all screens are navigable with mouse and touch; no dead-end state.

## UX Phase B — Import and setup
- Build MP4/MP3/TXT file pickers and media metadata panel.
- Implement speech/text workflow-specific fields.
- Add segmentation selector and timing-mode explanations.
- Show validation beside the relevant field.
- Acceptance: users understand required/optional files; invalid files can be replaced without restarting.

## UX Phase C — Preview and subtitle list
- Build video player, subtitle overlay, cue list, active cue highlight and seek-to-cue.
- Synchronize overlay to canonical timestamps.
- Acceptance: seeking, pausing and playback update the active subtitle accurately.

## UX Phase D — Timing and timeline
- Build numeric time fields first, then cue blocks, playhead and drag/resize.
- Add sequential/independent behavior and bulk duration actions.
- Add overlap/out-of-range messages.
- Acceptance: every drag action has an equivalent numeric action; invalid timing is explained and never silently repaired.

## UX Phase E — Styling
- Add font, size, color, bold/italic, outline, shadow, optional background and top/middle/bottom position.
- Map the same style model to preview and renderer.
- Acceptance: preview updates immediately; export warns about unsupported fonts/options.

## UX Phase F — Export and recovery
- Build export choices, destination and overwrite confirmation.
- Show actual progress, cancellation state, success validation and actionable errors.
- Acceptance: failed export preserves project and source; successful MP4 is validated before success is shown.

## UX Phase G — Mobile usability review
- Test on a phone with portrait and landscape clips.
- Verify keyboard does not cover numeric inputs, bottom sheets scroll, sticky actions don't cover content, and touch targets are usable.
- Test screen reader labels and keyboard navigation where supported.
- Run the usability tasks in UX_STRATEGY.md; record issues before marking UX complete.

## Implementation priority
P0: clear workflow selection, import, preview, cue list, numeric timing, core style controls, SRT/MP4 export states, mobile responsive behavior and accessible errors.
P1: timeline drag polish, undo/redo, style presets, autosave recovery and waveform.
P2: advanced animation, word-level highlighting and native mobile packaging.
