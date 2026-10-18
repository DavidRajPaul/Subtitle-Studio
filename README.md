# Subtitle Studio

**Status:** Planning — Phase 0 not started  
**Product:** Local-first subtitle editor  
**Initial target:** Desktop browser, with a responsive interface that can be reviewed and used on phones

Subtitle Studio creates subtitles from speech or prepared text, lets users edit timing and visual style, previews subtitles over video, and exports SRT or a new MP4 with subtitles burned in.

## Current development status

The repository documentation describes the product and planned architecture; do not mark a phase complete until the code and its acceptance criteria have been verified.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation, frontend/backend skeleton, diagnostics, tests | Not started |
| 1 | MP4 import, FFprobe metadata, preview | Not started |
| 2 | TXT parsing and timing engine | Not started |
| 3 | Subtitle editor, timeline, styles and preview | Not started |
| 4 | Local speech transcription | Not started |
| 5 | SRT and burned-in MP4 export | Not started |
| 6 | Hardening and MVP acceptance | Not started |
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

## Documentation

### Product and architecture
- [Product specification](docs/PRODUCT_SPEC.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [End-to-end implementation plan](docs/IMPLEMENTATION_PLAN.md)

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

- [ ] Import MP4 and inspect metadata.
- [ ] Transcribe dialogue locally from embedded audio or supplied MP3.
- [ ] Generate subtitles from TXT for silent video.
- [ ] Equal, readable-duration, fit-to-video and manual timing modes.
- [ ] Edit text, start/end/duration, font and placement.
- [ ] Preview and timeline reflect edits.
- [ ] Export UTF-8 SRT.
- [ ] Burn subtitles into a separate MP4.
- [ ] Validate output; source remains untouched.
- [ ] Test progress, errors, cancellation and project save/reopen.
- [ ] Review core flows on a phone and desktop viewport.

## License

Not yet selected. Review application, dependency, FFmpeg build, model and font licenses before distribution.
