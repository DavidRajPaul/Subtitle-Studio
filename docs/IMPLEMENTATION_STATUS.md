# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main`

## Current phase

**Phase 4 — Local speech transcription:** Built and verified with a stand-in recogniser — **the exit gate (a real speech sample producing editable cues) still needs one run with a real model**, which I could not do here (see "Not run").
**Owner approval for Phase 5:** Pending. Phase 5 has **not** been started.
Phases 0–3 were accepted by the owner's approvals to proceed.

## Acceptance criteria (from the plan) and where they stand

| Criterion | Status |
|---|---|
| faster-whisper adapter | Done (`backend/app/speech.py`); real model run not possible in this sandbox |
| Embedded audio or external MP3 | Done; both paths tested with real FFmpeg |
| Background jobs with progress | Done; progress, cancel, failure messages tested |
| Editable transcript | Done; result opens in the Phase 3 editor (verified in a browser, with stand-in text) |
| Speech sample produces editable cues **locally** | **Needs your run** (Codespace or your computer) |

## What now works (Phase 4)

- **Transcribe speech workflow:** pick an MP4; its audio is used, or choose a separate **MP3** ("will be used instead of the video's audio", warning if it is longer than the video). A silent video without an MP3 explains the choices (add an MP3 or use a text file) and Transcribe stays disabled.
- **Language:** Detect automatically (default) or choose one of 24 languages, including Tamil, Hindi, Telugu, Malayalam and Kannada. With Tiny/Base and a non-English language, the screen recommends **Small**.
- **Models (explicit, one-time download):** Tiny (~75 MB), Base (~145 MB, default), Small (~485 MB, recommended for Tamil), Medium (~1.5 GB). Nothing is downloaded until you press **Download**; the screen says it needs the internet once and comes from Hugging Face. After that, recognition is fully local. Downloads go to a temporary folder first, so a failed download leaves nothing half-installed.
- **Settings → Speech models:** engine status, cache folder, installed/size on disk, Download or Remove (with confirmation).
- **Background jobs:** one at a time on a worker thread; the UI polls every 0.5 s and shows a real percentage while recognising ("Recognising speech… (40%)"), an honest indeterminate bar when the amount of work is unknown (download, audio preparation), and **Cancel** at any point ("Cancelled. Nothing was changed.").
- **Audio pipeline:** FFmpeg (argument array) extracts 16 kHz mono WAV into an app-owned temporary folder that is always deleted afterwards; leftovers from a crash are removed at the next start (only UUID-named folders the app created). The source video/MP3 is never modified. MP3 copies are deleted when the import screen closes.
- **Recognition:** faster-whisper on the CPU (int8), voice-activity filtering, word timestamps. Long segments are split at word boundaries (≤ 84 characters, ≤ the max subtitle duration, preferring sentence ends). Recognised timing is kept exactly: nothing is stretched or de-overlapped; the editor's warnings flag anything hard to read.
- **Result → editor:** "N subtitles recognised in Tamil (detected, 91% sure). Check the text and timing in the editor" with a preview of the first five, then **Open in editor** creates a speech project (timed as Manual). In the editor, **Regenerate timing…** additionally warns that these times came from the speech.
- **Errors with next steps:** model missing, download failed (check internet), no audio, no speech recognised (pick the language), damaged model (remove and re-download), engine not installed, backend restarted (job unknown → start again).

## Key files

- Backend (new): `app/jobs.py`, `app/audio.py`, `app/speech.py`, `tests/test_speech.py`; `app/main.py` adds `POST /api/audio`, `DELETE /api/audio/{id}`, `GET /api/speech/models`, `POST/DELETE /api/speech/models/{name}[/download]`, `POST /api/speech/transcribe`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, and a `speech` entry in `/api/health`. `pyproject.toml`: `faster-whisper` dependency; mypy reads stubs with 3.12 grammar (NumPy's stubs need it; ruff still targets 3.11).
- Frontend (new): `components/SpeechSetup.tsx` (+ test), `ModelDownload.tsx`, `JobProgress.tsx`, `SpeechModelsPanel.tsx`, `api/speech.ts`, `hooks/useJob.ts`; `ImportScreen`, `CueEditor`, `EditorScreen`, `App`, `HealthPanel` (now says `pnpm backend`), `styles.css` updated.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint (both) | `pnpm lint` | Pass |
| Types (both) | `pnpm typecheck` | Pass (mypy strict, tsc) |
| Tests (both) | `pnpm test` | Pass — backend 96 passed + 1 skipped (real-model test, needs a model folder), frontend 98 |
| Frontend build | `pnpm --dir frontend build` | Pass |
| Frontend audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Backend audit | `pip-audit` on the exported runtime requirements (37 packages) | No known vulnerabilities |
| Browser workflow | Playwright + Chromium, 1400×900 and 390×844 touch, real backend with **only the recogniser and model download replaced** | Pass |

Browser workflow (both sizes): model shown as not installed → Download → progress → installed; Tamil selected (Small recommended); Transcribe → "Recognising speech… (27%)" with Cancel → "4 subtitles recognised in Tamil" → Open in editor → 4 cues → corrected the first line's text → Saved → reload → reopened with the correction → Settings lists the installed model. Phone: silent video kept Transcribe disabled until an MP3 was chosen. The stand-in recogniser checked that the real FFmpeg step produced 16 kHz mono audio. Temp folder empty and MP3 copy removed afterwards; no console errors; no sideways scrolling at 390 px.

**Not run / limitations of testing:**
- **No real speech recognition was run.** huggingface.co is blocked from my sandbox, so no model could be downloaded. The faster-whisper calls were checked against the installed library's signatures, and a test that runs a real model is included (`SUBTITLE_STUDIO_TEST_MODEL_DIR=<model folder> pnpm test`), but accuracy, speed and Tamil quality are unverified.
- No real phone; no screen reader walkthrough.
- Prettier is installed but not configured or enforced; I did not reformat the codebase.

## Decisions made (reversible)

1. **Explicit model download** (no silent download on first transcription), default model **Base**, Small recommended for non-English.
2. **CPU int8** for reliability on any computer; GPU acceleration is a later option.
3. **One job at a time**; jobs live in memory (a backend restart forgets them and the UI says so).
4. **Long segments split at word boundaries** (84 characters / max duration); timing otherwise kept as recognised.
5. Speech projects are saved with timing mode **Manual** (`workflow: "speech"` records the source); no project-file schema change.
6. A **failed** job, not an empty project, when no speech is found.

## Known limitations and unresolved decisions

- No translation, speaker labels or automatic line breaking inside a subtitle (the preview wraps text).
- Model downloads cannot be stopped midway; Cancel discards the model once the download step returns.
- Language and model choices are remembered in this browser only.
- Still open: no undo; orphaned video copies until Phase 6 cleanup; create the three architecture docs?; delete `docs/Test.md`?; timing defaults (17 cps, 1 s, 7 s, 0.1 s) OK?; Starlette `httpx2` warning; licence choice.

## What I need from you to close the Phase 4 gate

One real run, either way:
- **Codespace (works from your phone):** follow `docs/HOSTED_TEST.md`, open **Settings → Speech models**, download **Small**, then transcribe a short Tamil clip.
- **Your computer:** `uv sync --directory backend`, start the app, same steps.

Tell me how accurate it was and how long it took.

## Next phase and prerequisites

**Phase 5 — Export:** UTF-8 SRT, FFmpeg burn-in to a new MP4, progress, and output validation. Prerequisites: your approval, ideally after the real transcription run above.

## Owner review checklist (phone-friendly)

1. Settings → Speech models: download a model (Small for Tamil).
2. Home → **Transcribe speech** → choose an MP4 with speech → language **Tamil** → **Transcribe**: progress with a percentage; try **Cancel** once.
3. Transcribe again → result summary → **Open in editor**; fix a wrong word; it saves.
4. Try a silent MP4: Transcribe is disabled until you choose an MP3.
5. In the editor, **Regenerate timing…** warns that the speech timing will be replaced; Cancel.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 5" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
