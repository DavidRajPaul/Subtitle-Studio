# Subtitle Studio — UX Flows and Screen Specifications

**Version:** 1.0 · **MVP design reference**

## 1. Home / Projects

### Purpose
Get users into a project without making them understand technical settings.

### Layout
- Header: Subtitle Studio wordmark, local-processing indicator, Settings.
- Primary card: **Create a new project**.
- Two large workflow choices:
  - **Transcribe speech** — “Create editable subtitles from speech in an MP4 or separate MP3.”
  - **Use a text file** — “Turn a TXT script into subtitles for a video, even if it has no voice.”
- Recent projects list with name, last edited, media-missing indicator and open action.
- Empty state: explain that projects are stored locally and show the create action.

### Behavior
Selecting a workflow opens Import with that path preselected. Do not force the user to configure fonts or timing before importing media.

## 2. Import screen

### Shared controls
- Video file picker: MP4.
- After selection, show thumbnail/first frame if available, filename, duration, resolution, frame rate, and whether an audio stream exists.
- Clear replace/remove actions.
- Validation messages next to the relevant file, not only in a toast.

### Speech workflow
- Required: MP4.
- Optional: separate MP3 (“Use this audio for transcription instead of the video's audio”).
- Language: Auto-detect default; optional language selection if supported.
- Model settings are advanced; show estimated disk/performance tradeoffs and whether model is installed.
- Primary action: **Transcribe**.
- If video has no audio and no MP3 is selected, explain that the user can choose an MP3 or switch to the TXT workflow.

### TXT workflow
- Required: MP4 and TXT.
- TXT encoding: UTF-8; if decoding fails, explain how to resave as UTF-8.
- Segmentation choice:
  - One subtitle per non-empty line (recommended default).
  - Paragraphs separated by blank lines.
  - Split into sentences.
- Primary action: **Generate subtitles**.

### Loading and errors
Show progress only for actual work. Disable duplicate submissions while a job is running. Keep chosen files if validation fails so the user can correct only the problem.

## 3. Timing setup

After TXT import, show a compact timing card before entering the editor.

### Timing mode selector
Use four selectable cards or a segmented choice with explanatory helper text:
- **Equal distribution** — same duration for every cue; fills the video.
- **Readable duration** — duration depends on text length; may leave silent gaps at the end.
- **Fit to video** — attempts to cover the whole video without exceeding configured readability limits where feasible.
- **Manual** — use editable start and duration values.

### Readable settings
Advanced disclosure:
- Characters per second (default should be configurable and validated in usability testing).
- Minimum duration.
- Maximum duration.
- Gap between cues.
- Sequential placement toggle.

### Preview example
For a 12-second clip with one short line, “Hi everyone.”:
- Equal distribution: cue lasts 12 seconds.
- Readable duration: cue might last around 2 seconds, with the remaining video blank.
- Fit to video: cue may be stretched to cover the clip if the selected constraints allow it.
- Manual: user chooses start and duration.

The UI must describe the result before applying it. If the selected mode overwrites existing timings, require explicit confirmation.

## 4. Editor screen

### Desktop layout
1. **Top bar:** project name/save state, undo/redo when available, Export.
2. **Preview area:** video player with subtitle overlay; play/pause, seek, current time and duration.
3. **Subtitle list:** numbered rows with text, start, end and duration; active row follows playback.
4. **Timeline:** playhead, cue blocks and start/end handles; horizontal zoom/scroll.
5. **Inspector panel:** Text, Timing, Style tabs or sections for selected cue/global defaults.

### Narrow-screen layout
- Use a single-column page.
- Keep video preview near the top.
- Put playback controls directly under video.
- Show a horizontally scrollable subtitle list or a compact cue list.
- Use a dedicated **Edit subtitle** bottom sheet for text/start/end/duration.
- Use a **Style** bottom sheet for typography and placement.
- Timeline may be simplified to a horizontally scrollable strip; do not require drag gestures for precise timing.
- Keep Export visible in the top bar or sticky bottom action area without covering editing controls.

### Empty state
If there are no cues, show “No subtitles yet” with actions appropriate to the selected workflow: “Transcribe audio” or “Import text”.

## 5. Subtitle list and text editing

Each row shows:
- Cue index.
- Short text preview (wrap one or two lines).
- Start and end time.
- Optional warning icon with accessible explanatory text.
- Active playback highlight.

Tap/click a cue to select it and seek to its start. Text editing must preserve line breaks intentionally. Warn when a cue is too long for comfortable reading, but allow the user to proceed.

## 6. Timing inspector

For selected cue:
- Start time.
- End time.
- Duration.
- A clear choice of which value is authoritative when editing: changing start keeps duration by default; changing duration keeps start; changing end recalculates duration.
- Apply action only if edits are not immediately applied; prefer live updates with Undo when stable.
- “Apply duration to…”: selected cues, all cues, or a range.
- Placement behavior: Sequential or Independent.
- “Regenerate timing” is a separate, visibly destructive action with confirmation.

Validation:
- End must be after start.
- Start cannot be negative.
- Cues outside video duration are flagged.
- Overlaps are shown with text, not just red coloring.
- Never silently shift other cues to fix an overlap.

## 7. Style inspector

Group controls to avoid overwhelming users:

### Text
- Font family.
- Font size.
- Text color.
- Bold and italic.

### Readability
- Outline/stroke color and thickness.
- Shadow on/off and strength.
- Optional background box and opacity.

### Placement
- Top / Middle / Bottom presets.
- Horizontal alignment.
- Safe margin.
- Optional vertical offset for fine adjustment.

### Presets
MVP may include a small set of built-in presets such as Classic, High Contrast, and Minimal. Presets should be shortcuts, not mandatory. If not implemented in the first release, leave them post-MVP rather than delaying core editing.

Changes update preview immediately. Global styles apply to all cues unless a future per-cue override is supported. Export should warn if a selected font is unavailable to the renderer.

## 8. Export screen

Options:
- **SRT subtitle file** — editable/can be used in compatible players.
- **Burn subtitles into MP4** — subtitles become part of the pixels and cannot be toggled off.
- Both.

Show output filename and destination; never default to the source path. Confirm overwrite of an existing output. Display render progress, allow cancellation where safe, and explain failures with a recovery action. After success, show output location, file size, validation status, and actions to preview/open or export again.

## 9. Settings / diagnostics

Show:
- FFmpeg and FFprobe availability/version.
- Speech model selected, installed/download status, cache location and disk use.
- Default timing mode and readable-duration settings.
- Default font/style/placement.
- Temporary directory and safe cleanup action.
- Diagnostic export that excludes media contents and transcript text by default.

## 10. Copy and tone

Use plain, calm language. Prefer “Subtitles could not be exported” over “FFmpeg error 1”. Technical details can be expandable. Never blame the user. Every error should state what happened, what remains safe, and the next action.
