# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main`

## Current phase

**Phase 2 — TXT parsing and timing:** Verified — awaiting owner review.
**Owner approval for Phase 3:** Pending. Phase 3 has **not** been started.
Phases 0 and 1 were accepted by the owner's approvals to proceed.

## What now works (Phase 2)

- **TXT import** (text workflow, after a video is loaded): strict UTF-8 reading (BOM removed, line endings normalized, Unicode untouched). Clear errors with a next action for non-UTF-8 / UTF-16 files (with "save as UTF-8" steps), binary files, wrong extension, empty file, files over 2 MB, more than 5000 subtitles.
- **Segmentation:** one subtitle per line (default), per paragraph (blank-line separated, inner line breaks kept), or per sentence (`. ! ? … 。！？ । ॥`, skips abbreviations like Dr./Mr., initials and decimals; wrapped lines are joined).
- **Four distinct timing modes**, all in integer milliseconds, deterministic:
  - **Equal distribution:** identical durations, contiguous, fills the video (floor division; at most n−1 ms left at the end).
  - **Readable duration:** duration from text length at the characters-per-second setting, clamped to min/max, laid out with a gap; the rest of the video stays blank.
  - **Fit to video:** readable durations scaled to cover the video exactly (integer-exact), never above the maximum duration; if the maximum stops it filling the video, or the text is too long to fit comfortably, it says so.
  - **Manual:** exact start/duration values are accepted and validated by the engine (API). In the UI it starts from readable timing; per-subtitle editing is Phase 3.
- **Interval validation** (reports only, never moves/trims/deletes): start before 0, end ≤ start, past the end of the video, overlaps (touching is fine), too fast to read, below minimum, above maximum, plus whole-set warnings (readable text longer than the video, compressed fit, cannot fill).
- **UI:** choose segmentation and timing mode with a plain-language explanation of each; readability settings (characters per second, min, max, gap) with validation beside each field and Reset; a live **Result** line describing the outcome before anything is kept ("8 subtitles from … to …; … stays blank at the end"); read-only cue list with warnings written as text. Works on phone width (single column, 44 px targets).

## Key files

- Backend (new): `backend/app/subtitles.py` (canonical `Cue`, validation), `backend/app/timing.py` (engine), `backend/app/text_import.py`; `backend/app/main.py` adds `POST /api/text/parse` and `POST /api/timing/generate`.
- Backend tests (new): `test_timing.py`, `test_text_import.py`, `test_api_timing.py`.
- Frontend (new): `components/TextTimingSetup.tsx`, `api/subtitles.ts`, `lib/timingSettings.ts` (+ test), `TextWorkflow.test.tsx`; `screens/ImportScreen.tsx` and `styles.css` updated.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint (both) | `pnpm lint` | Pass |
| Types (both) | `pnpm typecheck` | Pass (mypy strict, tsc) |
| Tests (both) | `pnpm test` | Pass — backend 58, frontend 47 (1 known Starlette deprecation warning) |
| Frontend build | `pnpm --dir frontend build` | Pass |
| Dependency audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Browser smoke test | Playwright + headless Chromium vs the real backend, 390×844 touch and 1280×800 | Pass |

Browser smoke test (both widths): a Tamil + English script gave 8 lines / 2 paragraphs / 7 sentences; Equal on a 20 s video produced exactly 2.5 s each covering 00:00:20.000; Readable ended at 00:00:18.879 with 1.121 s blank; Fit covered the full 20 s; a 200-character line was flagged "hard to read (33 characters per second, limit 17)" and left unchanged; Tamil text displayed correctly; a minimum longer than the maximum showed an error beside the field and no result; a Latin-1 file showed the UTF-8 guidance; no sideways scrolling and no control under 44 px. Phone screenshots were inspected.

**Not run / limitations of testing:**
- **No real phone test** (phone width emulated in headless Chromium).
- Keyboard-only walkthrough and screen reader not tested.
- Very large scripts (thousands of lines) not performance-tested in the browser; the list shows the first 200 with "Show all".
- Sentence splitting uses a small English abbreviation list; other languages' abbreviations may split early.

## Decisions made (reversible)

1. **Engine lives in the backend** (Python, one implementation) and is called over the local API; the UI never re-implements timing.
2. **Defaults:** 17 characters/second, 1 s minimum, 7 s maximum, 0.1 s gap. All adjustable in the UI; please tell me if you want different defaults.
3. **Equal** has no gaps between cues; **Fit** compresses (with warnings) rather than overflowing when text is too long for the video.
4. **Manual** in the UI is seeded from readable timing and read-only until Phase 3.
5. **No confirmation dialog yet:** nothing in Phase 2 can be hand-edited, so regenerating can't discard manual work. The "confirm before regenerating over manual edits" rule is a Phase 3 requirement.
6. **Cue IDs** are random UUIDs created when timing is generated; cue numbers shown to the user are 1-based positions.
7. Limits: TXT up to 2 MB and 5000 subtitles.

## Known limitations and unresolved decisions

- The generated subtitles are not yet kept anywhere: leaving the screen or replacing the video discards the TXT and result. Saving and loading projects arrive with Phase 3.
- Timing is shown read-only; text/timing editing, the timeline, styling and the overlay on the video are Phase 3.
- Orphaned working copies of videos in `data/media/` (from Phase 1) still need safe cleanup (Phases 3 and 6).
- Still open from earlier: create `PRODUCT_SPEC.md` / `ARCHITECTURE.md` / `TECHNICAL_ARCHITECTURE.md`?; delete the 1-byte `docs/Test.md`?; Starlette `httpx2` deprecation warning; license choice.

## Next phase and prerequisites

**Phase 3 — Subtitle editor:** cue list, numeric timing, timeline, style controls, synchronized overlay on the video, local project save/load, and the confirm-before-regenerate rule.
Prerequisites: owner approval. Phase 3 is the largest phase; I suggest reviewing Phase 2 first and telling me anything about the timing defaults or wording you want changed.

## Owner review checklist (phone-friendly)

1. On a computer: `pnpm backend` and `pnpm frontend`, open http://127.0.0.1:5173 (see README).
2. Tap **Start** under "Create subtitles from text", pick an MP4, then **Select TXT** and pick a UTF-8 script (Tamil works).
3. Switch between the three splitting options: the count changes.
4. Switch between the four timing modes: the Result line changes and explains the outcome; try **Fit to video** and **Equal distribution** on a short script.
5. Add one very long line: it is flagged with a written warning and not changed.
6. Open **Readability settings**, set Minimum above Maximum: an error appears beside the field.
7. Pick a Notepad file saved as ANSI/Latin-1: a clear "save as UTF-8" message appears.
8. Use a phone-width browser window: one column, nothing sideways, buttons easy to tap.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 3" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
