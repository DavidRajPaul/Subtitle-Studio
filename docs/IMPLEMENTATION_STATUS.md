# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main`

## Current phase

**Phase 3 — Subtitle editor:** Verified — awaiting owner review.
**Owner approval for Phase 4:** Pending. Phase 4 has **not** been started.
Phases 0, 1 and 2 were accepted by the owner's approvals to proceed.

## What now works (Phase 3)

- **Projects:** after choosing a video and a TXT file, **Open in editor** creates a project and saves it immediately. Projects are versioned JSON files (`data/projects/<id>.json`, version 1), written atomically (temp file + replace), so a crash cannot leave half a file. Home lists **Your projects** (Open / Delete with a confirmation). A damaged or newer-version file is reported, never overwritten or deleted.
- **Autosave** with a status that is always visible: *Saving…*, *✓ Saved*, or *Could not save* with **Retry**. Saves are debounced (0.7 s), flushed when you go back, and the browser warns before closing with unsaved changes. Leaving after a failed save asks first.
- **One subtitle model** everywhere (`id`, `text`, `start_ms`, `end_ms`, integer milliseconds) for preview, project file and (later) SRT/render.
- **Cue list:** numbered, shows time range, marks **Showing now** and **Editing**, written warnings per cue, empty state with a next action, **+ Add at playhead**.
- **Numeric timing** (never drag-only): Start, End and Duration fields accept `HH:MM:SS.mmm`, `MM:SS` or seconds; Enter or leaving the field commits, Escape reverts, invalid input explains itself and changes nothing.
  - Start keeps the duration; End recalculates it; Duration keeps the start.
  - **Independent** (default) changes only the selected subtitle; **Sequential** moves later subtitles in the list by the same amount.
  - **Apply one duration to many subtitles** (selected / all / a range); all-or-nothing, with the reason if refused.
- **Timeline:** zoom, lanes for overlapping cues, playhead, click to seek; drag a block to move it, drag its handles to resize; keyboard nudge (arrows 0.1 s, Shift 1 s, Alt moves the end). Dragging respects the Independent/Sequential choice.
- **Synchronized overlay** on the video, scaled to the picture; follows playback frame by frame; start inclusive, end exclusive.
- **Style (one global style):** font (sans/serif/mono), size, colour, bold/italic, outline colour/thickness, shadow, background box (colour/opacity), position (top/middle/bottom), alignment, safe margin, vertical offset. Preview updates immediately. Font size is defined at a 1080-px-tall reference so preview and the later render agree.
- **Validation** shown in words (never colour only) using the same backend engine as Phase 2; overlap, too-fast, out-of-range etc. are **warnings only — nothing is moved or deleted automatically**.
- **Regenerate timing…** always asks first, states that hand-set timing will be lost, lets you pick Equal / Readable / Fit, keeps text and style. Cancelling changes nothing. (Undo does not exist yet and the dialog says so.)
- **Missing video:** if a project's working copy is gone, the subtitles stay editable and a banner offers **Choose the video again** (with a warning if the new video's length differs).
- **Layouts:** on a phone, one column with a bottom bar (**+ Add**, **Edit subtitle**, **Style**) opening bottom sheets that leave the picture visible above them; at ≥ 1000 px the editor has the video/timeline/list on the left and a Subtitle/Style panel on the right.
- **Export** is visible but disabled, with an explanation (arrives in Phase 5).

Backend additions: `GET/PUT/DELETE /api/projects[/{id}]`, `GET /api/media/{id}/file` (HTTP Range supported for seeking), `POST /api/timing/validate`. A saved project protects its video copy from the import screen's cleanup; deleting a project removes the copy only if no other project uses it.

## Key files

- Backend (new): `app/models.py` (pydantic project/style/cue schema), `app/projects.py` (store), `tests/test_projects.py`; `app/main.py` and `app/media.py` extended.
- Frontend (new): `screens/EditorScreen.tsx` (+ test); `components/` `CueList`, `CueEditor`, `Timeline`, `StylePanel`, `SubtitleOverlay`, `TimeField`, `NumberField`, `Sheet`, `ConfirmDialog`, `SaveStatus`; `lib/cueEdit.ts`, `lib/timeline.ts`, `lib/style.ts` (+ tests); `hooks/`; `api/http.ts`, `api/projects.ts`. `VideoPreview`, `Home`, `Import`, `TextTimingSetup`, `App`, `styles.css` updated.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint (both) | `pnpm lint` | Pass |
| Types (both) | `pnpm typecheck` | Pass (mypy strict, tsc) |
| Tests (both) | `pnpm test` | Pass — backend 69, frontend 86 (1 known Starlette deprecation warning) |
| Frontend build | `pnpm --dir frontend build` | Pass |
| Dependency audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Browser round-trip | Playwright + headless Chromium vs the real backend, 1400×900 and 390×844 touch | Pass |

Browser round-trip (both sizes): imported a clip and a Tamil + English script, opened the editor (8 subtitles), typed Start `00:00:01.000` (End moved to `00:00:02.059`, duration kept 1.059 s, status *Saved*), changed style to Top, dragged a timeline block (moved ~40 px, saved), went back, **reloaded the page**, reopened the project from Home: every subtitle's time and text identical and the video loaded; deleted the project (confirmation shown) and the list was empty. No console errors, no sideways scrolling at 390 px. Screenshots inspected; this surfaced and fixed a phone overflow and sheets that hid the picture.

**Not run / limitations of testing:**
- **No real phone test** (phone width emulated). Touch dragging on the timeline is only tested with a mouse; please try it on your phone.
- The test Chromium cannot decode H.264, so playback was verified with a VP9 MP4 only; H.264 playback depends on your browser (Chrome/Edge/Safari support it).
- Screen reader and full keyboard-only walkthrough not done (labels, focus return, Escape, Tab trapping are implemented and unit-tested).
- Hosted-test setup (below) is **not verified in a real Codespace**.

## Decisions made (reversible)

1. **Autosave, no Save button** — a visible status replaces it; Retry on failure.
2. **Independent** is the default for timing edits; **Sequential** is opt-in.
3. **Cues are kept in time order** when added; edits never re-sort silently.
4. The preview streams the project's **backend working copy**, so a project reopens after a reload; the original file you picked is never modified.
5. **One global style** (per-cue style is out of scope).
6. **Manual mode** in the editor means "every time was set by hand"; the project's recorded mode stays the last generated mode until you regenerate.

## Known limitations and unresolved decisions

- **No undo/redo yet** (dialogs say so for destructive actions). Suggest adding in a later phase.
- Replacing the video on the import screen resets the TXT choice.
- Orphaned working copies of videos (imports never saved as a project) remain in `data/media/` until cleanup (planned Phase 6).
- Sentence splitting knows only English abbreviations.
- Still open: create `PRODUCT_SPEC.md` / `ARCHITECTURE.md` / `TECHNICAL_ARCHITECTURE.md`?; delete the 1-byte `docs/Test.md`?; are the default timing values (17 cps, 1 s min, 7 s max, 0.1 s gap) acceptable?; Starlette `httpx2` deprecation warning; license choice.

## Next phase and prerequisites

**Phase 4 — Local speech transcription** (faster-whisper, embedded audio or a supplied MP3; results become the same editable cues). SRT and burned-in MP4 export follow in Phase 5.
Prerequisites: owner approval, and your feedback on the editor from a phone. Phase 4 will need a Whisper model downloaded once (I will state the size and licence before downloading anything).

## Owner review checklist (phone-friendly)

1. Start the app (README) or use a hosted-test link if one was shared with you.
2. **Start** under "Create subtitles from text", pick an MP4 and a UTF-8 TXT, tap **Open in editor**.
3. Tap a subtitle in the list: the video jumps to it and the text shows over the picture.
4. Tap **Edit subtitle**, type a new Start time (for example `1.5`), press Enter: the End moves with it, **✓ Saved** appears.
5. Tap **Style**, change colour, size and position: the picture updates behind the sheet.
6. Drag a block on the timeline; try the zoom buttons.
7. Make two subtitles overlap: a written warning appears and nothing moves.
8. **Regenerate timing…** shows a warning; **Cancel** changes nothing.
9. Go back, reload the page, open the project from **Your projects**: everything is as you left it.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 4" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
