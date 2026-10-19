# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main`

## Current work

**Browser-only web app — Stage 1: text workflow on GitHub Pages.** Built, verified and **live at https://davidrajpaul.github.io/Subtitle-Studio/** (Pages enabled by the owner; the workflow's build and deploy jobs passed on GitHub). Awaiting owner review on real devices.
Decision record: [ADR-001](ADR-001-browser-only-web-app.md). The owner chose this on 2026-10-19 so the main user (Android tablet, iPhone, sometimes a laptop) only has to open a link.

Plan of stages (each stops for review):
1. **Text workflow in the browser + publishing on Pages** ← this stage
2. Speech recognition in the browser (Whisper, model downloaded once on the device)
3. Export in the browser: SRT, then MP4 with burned-in subtitles

Phase 4 (speech with the Python backend) was built and is kept in the repository, but the web app does not use it; it becomes stage 2's starting point for the screens.

## Acceptance criteria for stage 1

| Criterion | Result |
|---|---|
| Works from a static site with no server | Pass: production build served under `/Subtitle-Studio/` made **0** server requests |
| MP4 checked in the browser (length, size, frame rate, audio) | Pass: real-file tests, including a rotated phone video |
| TXT reading, segmentation and the four timing modes give the same results as before | Pass: identical to the Python engine on 6 decode, 39 segmentation, 160 timing and 80 validation fixtures (cues **and** warning text) |
| Editor, autosave, reopen after reload, delete | Pass: browser test at phone and desktop size |
| Works offline after the first visit | Pass: reopened a saved project with the network off |
| Installable to the home screen | Manifest, icons and service worker present; real install not tested |
| Speech workflow explains it is not ready | Pass: "Speech recognition is coming next" with a way to use text instead |

## What changed

- **`frontend/src/engine/`** (new): `text.ts`, `timing.ts`, `py.ts` (Python-identical rounding, whitespace and formatting), `inspect.ts` (mp4box), `db.ts` (IndexedDB), `projectSchema.ts` (version-1 document with defaults and limits), tests and fixtures.
- **`frontend/src/api/`**: `media.ts`, `subtitles.ts`, `projects.ts` now call the engine and browser storage instead of the server (same functions, so screens barely changed). A chosen video is kept in memory and copied into browser storage when the project is first saved; the original file is never changed.
- **Settings** now shows *This device*: whether saving works, space used, whether projects are protected from automatic clean-up (with a **Keep my projects safe** button), H.264/HEVC playback, and Home Screen advice. The old FFmpeg diagnostics panel was removed.
- **Editor** loads the video from browser storage; "Loading the video…" while it does.
- **Home-screen app**: `manifest.webmanifest`, icons, Apple meta tags, and `sw.js` (network first, cached copy when offline).
- **Publishing**: `.github/workflows/pages.yml` runs lint, type-check, tests and the build on every push to `main`, then deploys to Pages.
- **Parity**: `backend/scripts/export_parity_fixtures.py` exports the Python engine's results; `engine/parity.test.ts` checks the browser engine against them.
- Speech-related screens from Phase 4 are kept, marked as not yet used.
- Docs: ADR-001, README (Pages link, local run without backend), CLAUDE.md architecture note, this file.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` (frontend ESLint + backend ruff) | Pass |
| Types | `pnpm typecheck` (tsc + mypy strict) | Pass |
| Tests | `pnpm test` | Pass: frontend 119, backend 96 + 1 skipped |
| Production build for Pages | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass: main script 227 KB (72 KB compressed); the MP4 reader (186 KB) loads only when a video is chosen |
| Frontend audit | `pnpm --dir frontend audit` | No known vulnerabilities (new: mp4box BSD-3-Clause; fake-indexeddb Apache-2.0, tests only) |
| Browser test of the built site | Playwright + Chromium against `vite preview` at `/Subtitle-Studio/`, 390×844 touch and 1400×900, **no backend running** | Pass (details above) |

**Not run / limitations of testing:**
- **Not tested on a real iPhone, Android tablet or in Safari.** Chromium only. Safari behaviour (storage limits, Add to Home Screen, file pickers) needs your check.
- The GitHub Actions workflow ran on GitHub: lint, type-check, tests, build and deploy all passed (run 39197585318, attempt 2). Action versions used: checkout v4, pnpm/action-setup v4, setup-node v4, configure-pages v5, upload-pages-artifact v3, deploy-pages v4.
- The test browser cannot decode H.264, so playback was tested with a VP9 MP4; phones play H.264 natively.

## Decisions made (reversible)

1. The engine was **ported, not rewritten**: same rules, same messages, proven by fixtures.
2. Videos are **copied into browser storage** when a project is first saved, so it can be reopened (a 2 GB limit per video; phones may have less space).
3. **Network-first** service worker, so updates appear immediately when online.
4. The Python backend is **kept** until browser speech works (not removed without your approval).

## Known limitations

- Projects live in **one browser on one device**; no sync between her iPhone and tablet. (A later "export/import project file" could move them.)
- **Safari may delete saved projects** of a website not opened for about a week, unless the app is added to the Home Screen. Settings explains this.
- Speech recognition and export are not in the web app yet.
- Still open from earlier: no undo; timing defaults (17 cps, 1 s, 7 s, 0.1 s) OK?; delete `docs/Test.md`?; create the architecture docs?; licence choice.

## What I need from you

Open **https://davidrajpaul.github.io/Subtitle-Studio/** on the iPhone (Safari) and the Android tablet, add it to the Home Screen, and try the checklist below.

## Owner review checklist (phone-friendly)

1. Open the link; tap **Start** under "Create subtitles from text"; pick an MP4 and a UTF-8 TXT.
2. Try the timing modes; tap **Open in editor**; change a time and the style; **✓ Saved** appears.
3. Close the browser completely, open the link again: the project is under **Your projects**.
4. Turn on aeroplane mode and open the app from the Home Screen: it still opens and shows the project.
5. Settings → **This device**: check "Plays MP4 (H.264): Yes" on her devices; tap **Keep my projects safe**.
6. **Transcribe speech** says it is coming next.

PHASE GATE: I will not begin the next stage until you explicitly approve it. Reply "Approved. Proceed to Stage 2 (speech in the browser)" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
