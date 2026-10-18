# Subtitle Studio — UX Strategy and Experience Principles

**Version:** 1.0  
**Status:** Design specification for MVP  
**Audience:** Product owner, UX/UI designer, Claude coding agent

## 1. Product experience goal

Make subtitle creation feel safe, visual, and understandable to a creator who is not a video-editing professional. The user should always understand:
1. What media and subtitle source are active.
2. Which timing mode is being used and what it will do.
3. What the final video will look like.
4. Whether edits are saved.
5. What will happen when they export.

The experience should feel like a focused subtitle tool, not a complex professional video editor.

## 2. UX principles

### Preview first, controls second
The video preview is the visual anchor. Timing and style changes should be visible immediately in preview, without requiring export.

### Keep the first decision simple
The first screen asks the user to choose one of two workflows: **Transcribe speech** or **Create subtitles from text**. Advanced settings should not block starting.

### Progressive disclosure
Show essential controls by default. Put characters-per-second, timing bounds, line segmentation rules, safe margins, outline thickness, and render settings in expandable sections.

### Make timing understandable
Use human-readable labels with a one-line explanation:
- **Equal distribution:** every subtitle gets the same share of the video.
- **Readable duration:** longer text stays longer; unused video may remain blank.
- **Fit to video:** spread captions across the whole video while respecting readability where possible.
- **Manual timing:** I control each start and duration.

Never hide a conflict between the selected timing mode and user-edited timestamps.

### Preview is the truth users can inspect
The preview should show the currently active subtitle at the actual playback time. Use the same project style settings for preview and export, while clearly noting that font/rendering differences can occur across systems.

### Protect user work
Autosave where feasible, show save state, warn before destructive timing regeneration, and never overwrite the source video.

### Local-first trust
Explain that video, audio, text and transcription stay on the user's device in the MVP. First-time model downloads may require internet. Never imply that processing is offline before required model files are installed.

### Accessible by default
Readable contrast, visible focus, keyboard support on desktop, sufficiently large touch targets, labels for icon-only controls, and warnings that do not rely on color alone.

## 3. Personas and core jobs

**Creator in a hurry:** wants quick captions, simple style, and an export that works.

**Creator of silent/edited footage:** has a video and prepared TXT script, needs predictable timing.

**Detail-focused creator:** wants exact subtitle start/end times, custom font/position, and precise preview.

Do not build separate products for these users. Provide a simple path first and precision controls when needed.

## 4. Information architecture

Primary screens:
1. **Home / Projects** — create project, open recent project, explain local processing.
2. **New Project / Import** — choose speech or text workflow and add local files.
3. **Processing** — inspect media, transcribe or generate subtitle timings, show progress.
4. **Subtitle Editor** — preview, subtitle list, timeline, timing and style controls.
5. **Export** — choose SRT, burned-in MP4, or both; destination, progress, validation.
6. **Settings / Diagnostics** — model status, FFmpeg status, defaults, temp storage and troubleshooting.

On a desktop layout, use a three-region editor: preview at center, subtitle list/timeline below, contextual controls at the side. On narrow screens, prioritize a single-column flow and a bottom sheet for detailed settings. Do not squeeze the full desktop editor into a phone screen.

## 5. Navigation and state

- Every project has a visible name and save state: **Saving…**, **Saved**, or **Could not save**.
- The editor has a persistent primary action: **Export**.
- The current workflow and source files are visible but not visually dominant.
- Back navigation must not silently discard edits.
- Long-running operations have progress, cancellation where safe, and clear failure recovery.
- When a project has no subtitle segments, show an empty state with a clear next action.

## 6. MVP usability targets

These are product targets to validate, not claims of measured performance:
- A first-time user can start either workflow without reading documentation.
- The first preview appears as soon as media is loaded and a subtitle exists.
- A user can change a cue's start and duration without dragging a timeline.
- A user can tell whether a timing mode fills the video or leaves gaps.
- A user can correct an ASR mistake without restarting transcription.
- A failed export preserves the project and source media.
- A user can find the next action from every empty, loading, success, and error state.

## 7. Usability test tasks

Test with at least three people who did not design the app:
1. Import a silent MP4 and TXT, then create readable subtitles.
2. Make every line last exactly three seconds.
3. Change one cue to start at 5 seconds and last 2 seconds.
4. Move subtitles from bottom to top and change font size.
5. Correct a transcription error.
6. Export SRT and burned-in MP4.
7. Recover from a missing FFmpeg/model or failed export message.

Record task completion, hesitation, misclicks, and misunderstood labels. Fix high-severity confusion before adding post-MVP features.
