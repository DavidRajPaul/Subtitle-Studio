# Subtitle Studio

**Status:** Easy mode (default) + style tools — awaiting owner review  
**Product:** Local-first subtitle editor  
**Initial target:** Desktop browser, with a responsive interface that can be reviewed and used on phones

Subtitle Studio creates subtitles from speech or prepared text, lets users edit timing and visual style, previews subtitles over video, and exports SRT or a new MP4 with subtitles burned in.

## Current development status

The repository documentation describes the product and planned architecture; do not mark a phase complete until the code and its acceptance criteria have been verified.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation, frontend/backend skeleton, diagnostics, tests | Accepted (owner approved Phase 1) |
| 1 | MP4 import, FFprobe metadata, preview | Accepted (owner approved Phase 2) |
| 2 | TXT parsing and timing engine | Accepted (owner approved Phase 3) |
| 3 | Subtitle editor, timeline, styles and preview | Accepted (owner approved Phase 4) |
| 4 | Local speech transcription | In the browser (stage 2) — awaiting owner review on real devices |
| 5 | SRT and burned-in MP4 export | In the browser (export stage) — awaiting owner review on real devices |
| 6 | Hardening and MVP acceptance | Done in the browser app ([acceptance scenarios](docs/ACCEPTANCE.md)) — awaiting owner review on real devices |
| 7 | Optional post-MVP improvements | Deferred |

**MVP:** both speech and TXT workflows, four timing modes, manual timing, font/style/placement controls, preview, project save/load, SRT export and burned-in MP4 export.

## Workflows

- **Speech:** MP4 + optional separate MP3 → local transcription → correct text/timestamps → style/preview → export.
- **Text/silent video:** MP4 + TXT → choose line/paragraph/sentence segmentation → select timing mode → edit → style/preview → export.

## Product and UX decisions

- React + TypeScript + Vite frontend; local Python + FastAPI backend.
- faster-whisper for local speech recognition; FFmpeg/FFprobe for media.
- Versioned local JSON projects initially.
- No cloud inference, media uploads or telemetry in MVP.
- Native mobile app and Tauri packaging are post-MVP decisions.
- The editor is desktop-first, but the UX must be responsive and usable on phones. The phone layout uses one column and bottom sheets rather than compressing desktop panels.
- MCP is not required at runtime for transcription or rendering.

## Use it from a link (GitHub Pages)

Subtitle Studio runs entirely in the browser: open **https://davidrajpaul.github.io/Subtitle-Studio/** on a phone, tablet or computer. Videos and text stay on that device; projects are saved in that browser. On iPhone/iPad use Safari → Share → **Add to Home Screen**; on Android, the browser menu → **Add to Home screen / Install app**. See [docs/ADR-001-browser-only-web-app.md](docs/ADR-001-browser-only-web-app.md).

Publishing is automatic: every push to `main` runs `.github/workflows/pages.yml` (lint, type-check, unit tests, build, browser regression tests at phone and desktop size, deploy). A failing check stops the publish. One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Easy mode (the default) makes subtitles in three steps: choose a video (MP4, MOV, M4V, WebM, MKV or 3GP) → the words (voice, typed or pasted, or a TXT file) → pick a look; Editor mode keeps full control. Also in the web app: the text workflow (MP4 + TXT → timing → editor → saved projects) and speech recognition (MP4 audio or a separate MP3 → Whisper running on the device → editor). Styles can be saved as named presets and applied to any video. Export works in the browser too: an SRT file, or a new MP4 with the subtitles drawn into the picture (the original is never changed).

## Try it from a link (hosted test, Codespaces — legacy)

Testers without a development setup can use a GitHub Codespace: [Open in Codespaces](https://codespaces.new/DavidRajPaul/Subtitle-Studio). The owner starts it, makes port 5173 public and shares the forwarded address. Files are then processed on that cloud machine, which the app states. Steps, privacy notes and a message for testers are in [docs/HOSTED_TEST.md](docs/HOSTED_TEST.md).

## Running locally

The web app needs only Node.js 22+ and pnpm 10+:

```bash
pnpm --dir frontend install        # dependencies
pnpm frontend                      # app on http://127.0.0.1:5173 (no backend needed)
pnpm --dir frontend test           # includes the parity tests against the Python engine
SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build
pnpm --dir frontend e2e            # browser regression suite (Playwright), see docs/ACCEPTANCE.md
```

The legacy Python backend (Python 3.11+, [uv](https://docs.astral.sh/uv/), FFmpeg/FFprobe) is kept for reference and for regenerating the parity fixtures (`uv run --directory backend python scripts/export_parity_fixtures.py`):

```bash
uv sync --directory backend
pnpm backend                       # API on http://127.0.0.1:8000
pnpm lint && pnpm typecheck && pnpm test   # both frontend and backend
```

Optional environment variables: `SUBTITLE_STUDIO_FFMPEG` and `SUBTITLE_STUDIO_FFPROBE` (binary paths), `SUBTITLE_STUDIO_PORT`, `SUBTITLE_STUDIO_DATA_DIR` (app-owned working copies; default `./data`, gitignored). The backend binds to `127.0.0.1` only.

## Documentation

### Product and architecture
- Product specification, system architecture and technical architecture: **not yet written.** Their requirements currently live in this README, [CLAUDE.md](CLAUDE.md) and the UX documents below. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the open decision.
- [End-to-end implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Implementation status (handover note)](docs/IMPLEMENTATION_STATUS.md)

### UX and visual design
- [UX strategy and principles](docs/UX_STRATEGY.md)
- [UX flows and screen specifications](docs/UX_FLOWS.md)
- [UI design system and interaction rules](docs/UI_DESIGN_SYSTEM.md)
- [Low-fidelity wireframes](docs/UX_WIREFRAMES.md)
- [UX implementation plan](docs/UX_IMPLEMENTATION_PLAN.md)
- [Claude UX implementation addendum](docs/CLAUDE_UX_ADDENDUM.md)

- [Claude project instructions](CLAUDE.md)

## Mobile-first review notes

The current owner is working from a phone and does not currently have a laptop. Keep the docs readable on mobile and avoid requiring local setup for documentation review. Actual app development/testing will still need a suitable computer or cloud development environment once implementation begins.

## Development approach

Implement one phase at a time. Each phase needs tests, actual command results, human smoke testing, and a commit before proceeding. Never claim tests passed unless they were run. Keep main runnable.

## MVP checklist

- [x] Import MP4 and inspect metadata (Phase 1, awaiting owner review).
- [x] Transcribe dialogue locally from embedded audio or supplied MP3 (Phase 4, awaiting owner test with a real model).
- [x] Generate subtitles from TXT for silent video (Phase 2, awaiting owner review; editing and export come later).
- [x] Equal, readable-duration, fit-to-video and manual timing modes (Phases 2–3).
- [x] Edit text, start/end/duration, font and placement (Phase 3).
- [x] Preview and timeline reflect edits (Phase 3).
- [x] Export UTF-8 SRT (export stage, awaiting owner review).
- [x] Burn subtitles into a separate MP4 (export stage; H.264 where the device can encode it).
- [x] Validate output; source remains untouched (the new file is re-opened and checked before it is offered).
- [x] Test progress, errors, cancellation and project save/reopen (Phase 6: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md), run before every publish).
- [x] Review core flows on a phone and desktop viewport (automated at 390×844 touch and 1400×900; real-device review pending).

## Implementation cycle (video editor roadmap)

The full feature list, with notes and feasibility, is in [docs/FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md). Phases are ordered from the most-used features. Each phase runs the same cycle, and a box is ticked only after its tests pass and it is published:

1. **Scope:** the phase's tasks and acceptance criteria are stated.
2. **Build:** written from scratch for this app, with no code or assets taken from other products.
3. **Test:** unit tests, plus browser tests at phone and desktop size (`pnpm --dir frontend e2e`).
4. **Document:** this checklist, [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md), and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).
5. **Publish:** push to `main`. The publish job re-runs every check and deploys only if all pass.
6. **Review:** the owner tries it on a phone and a tablet.
7. **Approve:** then the next phase begins.

Feasibility: ● on the device · ◐ on the device with limits · ○ not planned (needs servers or licensed content). Phase F12 lists the ○ items.

**F1 · Cut the video (most used)** — done, awaiting review on her devices

- [x] F1.1 Trim the start and end of the video, by typing exact times or setting them from the playhead (drag handles come with the multi-clip timeline, F5) ●
- [x] F1.2 Split at the playhead and delete a part ●
- [x] F1.3 Delete left / delete right of the playhead ●
- [x] F1.4 Restore a deleted part ●
- [x] F1.5 Preview plays the cut version, skipping deleted parts ●
- [x] F1.6 Export the cut version: picture re-encoded, sound copied as is ●

**F2 · Music and sound**

- [ ] F2.1 Add background music from her own files (MP3, M4A, WAV) ●
- [ ] F2.2 Volume for the video's own sound and for the music; mute the original ●
- [ ] F2.3 Fade in / fade out ●
- [ ] F2.4 Trim and move the music ●
- [ ] F2.5 Record a voice-over with the microphone ●
- [ ] F2.6 Save the sound only (extract audio) ◐
- [ ] F2.7 Sound effects from her own files ●
- [ ] F2.8 Simple voice effects: echo, deep, high, robot ●

**F3 · Frame size and canvas**

- [ ] F3.1 Aspect ratio: 9:16, 16:9, 1:1, 4:5, 4:3, original ●
- [ ] F3.2 Fit or fill; position and zoom the video in the frame ●
- [ ] F3.3 Background for empty space: colour, blurred video, image ●
- [ ] F3.4 Crop, rotate 90°, flip (mirror) ●
- [ ] F3.5 Social presets (Shorts, Reels, Status, YouTube) on export ●

**F4 · Speed**

- [ ] F4.1 Constant speed 0.1× to 10×, slow motion ◐
- [ ] F4.2 Reverse a part ◐
- [ ] F4.3 Freeze frame ●
- [ ] F4.4 Speed curves (ramp presets: montage, hero, bullet, flash in/out) ●

**F5 · Several clips and photos**

- [ ] F5.1 Add more videos and photos to one project; photo duration ●
- [ ] F5.2 Reorder, duplicate, replace and delete clips ●
- [ ] F5.3 Transitions between clips: fade, dissolve, slide, zoom, wipe, blur, spin ●
- [ ] F5.4 Undo and redo for every edit ●
- [ ] F5.5 Markers on the timeline ●

**F6 · Text layers and stickers**

- [ ] F6.1 Free text layers (titles), separate from subtitles, placed anywhere ●
- [ ] F6.2 Text templates (our own designs) ●
- [ ] F6.3 Stickers: emoji, shapes, her own images/PNGs, lower thirds, countdowns, progress bar ●
- [ ] F6.4 Draw on the video ●
- [ ] F6.5 Text-to-speech voice-over ◐

**F7 · Filters, colour and effects**

- [ ] F7.1 Adjust: brightness, contrast, saturation, warmth, tint, fade, sharpen, vignette ●
- [ ] F7.2 Filters: our own presets (warm, cool, cinematic, B&W, vintage …) ●
- [ ] F7.3 Advanced colour: HSL, curves, colour wheels ●
- [ ] F7.4 Video effects: blur, glitch, VHS, film grain, shake, zoom pulse, light leaks ●
- [ ] F7.5 Auto adjust (balance lighting and colour) ◐

**F8 · Overlays and green screen**

- [ ] F8.1 Picture-in-picture: a second video or image on top, moved and resized ●
- [ ] F8.2 Opacity and blend modes (multiply, screen, overlay …) ●
- [ ] F8.3 Masks: line, mirror, circle, rectangle, heart, star; feather ●
- [ ] F8.4 Green screen (chroma key) ●
- [ ] F8.5 Split screen layouts ●

**F9 · Keyframes and animation**

- [ ] F9.1 Keyframes for position, size, rotation, opacity and volume ●
- [ ] F9.2 Easing curves ●
- [ ] F9.3 Clip in/out/combo animations (zoom, slide, rotate, bounce) ●

**F10 · Workflow, templates and export**

- [ ] F10.1 Export settings: resolution (480p to 4K), frame rate (24/25/30/50/60), quality ◐
- [ ] F10.2 Save a frame as a picture; choose a cover image ●
- [ ] F10.3 Project templates: save a project's look and structure, reuse it with new media ●
- [ ] F10.4 Keyboard shortcuts on computers ●
- [ ] F10.5 Duplicate a project; back up and restore projects as a file ●
- [ ] F10.6 Share to apps through the phone's share sheet ◐

**F11 · Smart tools on the device**

- [ ] F11.1 Remove silences and filler words (from the speech recogniser's word times) ●
- [ ] F11.2 Edit the video by editing its transcript ●
- [ ] F11.3 Beat detection: markers on the music's beats, cut to the beat ●
- [ ] F11.4 Noise reduction and loudness normalisation ◐
- [ ] F11.5 Background removal for people (no green screen) ◐
- [ ] F11.6 Auto reframe (keep the face in frame when changing aspect ratio) ◐
- [ ] F11.7 Scene detection / auto cut ●
- [ ] F11.8 Caption translation ◐
- [ ] F11.9 Stabilisation ◐
- [ ] F11.10 Vocal isolation, enhance voice ◐

## License

The app's own licence is **not yet selected** (owner decision). Third-party licences were reviewed in Phase 6.

Web app: every package that ships in the site is listed, with its full licence text, in `THIRD_PARTY_LICENSES.txt` (generated from the actual bundle at build time; linked from Settings → About and licences). Summary: 54 bundled fonts under the SIL Open Font License or Apache-2.0 (list in [docs/FONTS.md](docs/FONTS.md)), transformers.js (Apache-2.0), ONNX Runtime Web (MIT), mediabunny (MPL-2.0, used unmodified from npm; its source is at https://github.com/Vanilagy/mediabunny); speech models are OpenAI Whisper (MIT) in the Xenova/whisper-* conversions, downloaded by the user on demand from Hugging Face and never bundled. Legacy backend, reviewed in Phase 4: faster-whisper (MIT), CTranslate2 (MIT), PyAV (BSD-3-Clause; checked in Phase 6: the 19.0.1 wheel bundles FFmpeg built as LGPL-3.0-or-later plus the GPL x264/x265 libraries; the backend is not distributed, so this matters only if it were ever repackaged), onnxruntime (MIT, used for voice-activity detection), huggingface_hub and tokenizers (Apache-2.0), NumPy (BSD-3-Clause and others), tqdm (MPL-2.0 and MIT). Speech models: Systran's faster-whisper conversions of OpenAI Whisper (MIT); downloaded by the user on demand, never bundled in the repository.
