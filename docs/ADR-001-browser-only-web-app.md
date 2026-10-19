# ADR-001: Run Subtitle Studio entirely in the browser (GitHub Pages)

**Date:** 2026-10-19 · **Status:** Accepted by the owner · **Supersedes:** the FastAPI + faster-whisper runtime described in README/CLAUDE.md

## Context

The main user will use the app on an **Android tablet and an iPhone** (sometimes a laptop) and should only have to open a link. The original architecture needs a Python backend with FFmpeg, which GitHub Pages cannot run; the Codespace workaround needs the owner to start it, set a port public, and it stops after ~30 minutes idle.

## Decision

Build the app as a **static web app on GitHub Pages** whose processing runs **in the browser on the user's device**:

| Concern | Before | Now (browser) |
|---|---|---|
| Video inspection | FFprobe (backend) | mp4box.js reads the MP4's index boxes (`src/engine/inspect.ts`) |
| TXT decoding/segmentation | Python | TypeScript port (`src/engine/text.ts`) |
| Timing + validation | Python | TypeScript port (`src/engine/timing.ts`), tested for identical results against fixtures exported from the Python engine (`backend/scripts/export_parity_fixtures.py`) |
| Projects + video copies | JSON files + media folder | IndexedDB in the browser (`src/engine/db.ts`, `src/api/projects.ts`); same version-1 document and rules (`src/engine/projectSchema.ts`) |
| Speech recognition | faster-whisper (backend) | **Next stage:** Whisper running in the browser (model downloaded once) |
| Export (SRT, burn-in) | FFmpeg (planned) | **Later stage:** SRT generated in the browser; MP4 burn-in with FFmpeg compiled to WebAssembly |
| Offline | n/a | Service worker caches the app after the first visit; installable to the home screen |

## Consequences

- **Privacy is stronger:** media never leaves the device and there is no server at all. The "Nothing is uploaded" wording is literally true.
- **No setup for the user:** one link; can be added to the home screen.
- **Device limits:** phones have less memory and CPU. Long videos, speech recognition and burn-in will be slower on a phone and may need limits (to be measured in those stages).
- **Storage can be cleared by the browser:** Safari may delete website data that has not been used for about a week unless the app is added to the Home Screen; the app asks for persistent storage and explains this in Settings. Projects live only in that browser on that device (no sync).
- **Two engines during the transition:** the Python backend stays in the repository, unused by the web app, until the browser covers speech; its parity script keeps the engines identical. Removing it needs the owner's approval.
- CLAUDE.md rules about the backend (binding to 127.0.0.1, FFmpeg argument arrays) still apply to that code while it exists; rules about media safety, integer-ms timing, one subtitle model, and UX apply unchanged to the browser engine.
