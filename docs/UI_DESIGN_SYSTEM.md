# Subtitle Studio — UI Design System and Interaction Specification

**Version:** 1.0 · **MVP**

## 1. Visual direction

Aim for a calm, precise, creator-focused studio: dark neutral editing canvas, high-contrast controls, restrained accent color, and generous spacing. The video should be the visual hero. Avoid decorative gradients, excessive glass effects, dense toolbars, and tiny timeline controls.

The design must also work in light mode. Use semantic design tokens rather than hard-coded colors in components.

## 2. Design tokens

Initial tokens are starting values and must be checked for contrast and real-device readability.

- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Control heights: 44 px minimum for touch; compact 36 px only for desktop secondary controls.
- Corner radii: 8 px controls, 12 px cards, 16 px major panels.
- Typography: system UI for app chrome; subtitle preview uses the user's chosen subtitle font.
- Main body text: target 16 px; secondary text not below 13 px without a strong reason.
- Focus ring: always visible for keyboard users.
- Touch target: target at least 44 × 44 CSS px.
- Use neutral surfaces and one accent for primary actions; use semantic success/warning/error colors only for status.

## 3. Component inventory

Build reusable components:
- AppShell and TopBar.
- ProjectCard and WorkflowChoiceCard.
- FileDropZone / FilePickerRow.
- MediaMetadataPanel.
- TimingModeCard / TimingModeSelector.
- VideoPreview with SubtitleOverlay.
- PlaybackControls and TimecodeField.
- SubtitleCueRow and CueList.
- TimelineRuler, Playhead, CueBlock, CueResizeHandle.
- TextEditor, NumericTimeInput, DurationInput.
- FontPicker, ColorPicker, ToggleButton, SegmentedControl.
- StylePreview and PositionSelector.
- JobProgressPanel, InlineError, EmptyState, ConfirmDialog, Toast.
- SaveStatus and ExportResultPanel.

Each interactive component must have loading, disabled, focus, error and empty states where relevant.

## 4. Interaction rules

- Prefer explicit labels to icon-only controls.
- Numeric time fields accept a predictable format such as HH:MM:SS.mmm; show examples and validation.
- Dragging a cue moves it; resizing its left/right edge changes start/end. Do not use the same gesture for both.
- Support numeric input for every timing action available by dragging.
- Keep selection stable after edits and maintain cue IDs.
- On touch devices, avoid requiring precise handles smaller than touch-target guidance; provide an edit sheet with numeric fields.
- Use a confirmation dialog before timing regeneration discards manual timing.
- Use Undo for ordinary edits when available; don't use confirmation dialogs for every small change.
- Display save state in the same location consistently.
- If export fails, preserve the project and provide Retry and diagnostic details.

## 5. Accessibility requirements

- WCAG 2.2 AA contrast target for interface text and controls.
- Keyboard navigation for project creation, cue selection, timing edits, style controls and export.
- Focus is visible and not hidden behind sticky bars or dialogs.
- Screen-reader labels for play/pause, seek, font controls, position controls, cue timing and validation warnings.
- Do not rely only on color for selected, active, overlap or error states.
- Respect reduced-motion preferences; avoid unnecessary animated UI.
- Captions themselves must preserve Unicode and line breaks.

## 6. Responsive behavior

### Desktop (primary editor)
Preview + inspector side-by-side; cue list and timeline below preview. Keep inspector width stable and allow preview to maintain video aspect ratio.

### Tablet
Preview first; inspector collapses to tabs/drawer; timeline can scroll horizontally.

### Phone
Single column. No three-column layout. Use bottom sheets for timing and style, 44 px touch targets, numeric editing, and a simplified timeline. Export and save state remain easy to find. Avoid relying on hover.

## 7. State design

Every major view needs:
- Initial/empty state.
- Loading state with progress only when measurable.
- Success state.
- Recoverable error state.
- Disabled state with reason where helpful.
- Offline/model-not-installed state.
- Missing source media state.
- Unsaved/save-failed state.

## 8. UX quality gates

Before calling UX implementation complete:
- Check contrast and touch targets on a real phone.
- Test portrait and landscape video.
- Test long subtitles and Unicode scripts.
- Verify playback overlay timing while seeking and pausing.
- Verify mobile keyboard does not obscure time fields.
- Verify bottom sheets and sticky actions don't cover controls.
- Test cancellation and failed export recovery.
- Run usability tasks from UX_STRATEGY.md and record observed issues.
