# Subtitle Studio

**Status:** Phase 3 verified — awaiting owner review  
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
| 3 | Subtitle editor, timeline, styles and preview | Verified — awaiting owner review |
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

## Try it from a link (hosted test)

Testers without a development setup can use a GitHub Codespace: [Open in Codespaces](https://codespaces.new/DavidRajPaul/Subtitle-Studio). The owner starts it, makes port 5173 public and shares the forwarded address. Files are then processed on that cloud machine, which the app states. Steps, privacy notes and a message for testers are in [docs/HOSTED_TEST.md](docs/HOSTED_TEST.md).

## Running locally (Phase 0)

Prerequisites: Node.js 22+, pnpm 10+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and FFmpeg/FFprobe on `PATH`.

```bash
pnpm --dir frontend install        # frontend dependencies
uv sync --directory backend        # backend dependencies
pnpm backend                       # API on http://127.0.0.1:8000 (GET /api/health)
pnpm frontend                      # UI on http://127.0.0.1:5173 (proxies /api)
pnpm lint && pnpm typecheck && pnpm test
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
- [ ] Transcribe dialogue locally from embedded audio or supplied MP3.
- [x] Generate subtitles from TXT for silent video (Phase 2, awaiting owner review; editing and export come later).
- [x] Equal, readable-duration, fit-to-video and manual timing modes (Phases 2–3).
- [x] Edit text, start/end/duration, font and placement (Phase 3, awaiting owner review).
- [x] Preview and timeline reflect edits (Phase 3, awaiting owner review).
- [ ] Export UTF-8 SRT.
- [ ] Burn subtitles into a separate MP4.
- [ ] Validate output; source remains untouched.
- [ ] Test progress, errors, cancellation and project save/reopen.
- [ ] Review core flows on a phone and desktop viewport.

## License

Not yet selected. Review application, dependency, FFmpeg build, model and font licenses before distribution.
