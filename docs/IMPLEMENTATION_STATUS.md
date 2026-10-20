# Implementation Status

**Last updated:** 2026-10-20 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**Phase 6: hardening and MVP acceptance.** Done for the browser app and verified in a real browser at phone and desktop size. Awaiting the owner's review on her iPhone and Android tablet.

Stages: 1 text on Pages ✓ · 2 speech in the browser ✓ · Easy mode + styles ✓ · export ✓ · formats + presets ✓ · **Phase 6 (this stage)** · next: Phase 7 (post-MVP), only once you choose what is worth doing.

## Acceptance criteria (Phase 6 exit: "all P0 acceptance scenarios pass")

The scenarios and the test behind each one are listed in [ACCEPTANCE.md](ACCEPTANCE.md).

| Area | Result |
|---|---|
| P0 scenarios A–K, X (25 scenarios) | Pass: 51 browser checks at phone and desktop size, plus the voice test with real Whisper weights |
| Failure paths | Pass: storage full, private browsing, missing video, failed and cancelled model download, a browser that can't make videos, unreadable or empty files |
| Cancellation | Pass: video export, model download and voice recognition each say nothing was kept or changed. Leaving the page mid-export asks first. |
| Safe clean-up | Pass: deleting a project deletes its video copy; removing the last model also removes the 12 MB speech runtime; video readers and temporary links are released |
| Licensing | Pass: `THIRD_PARTY_LICENSES.txt` is generated from what actually ships and linked from Settings. The legacy backend's FFmpeg was checked. **The app's own licence is still your decision.** |
| Regression | Pass: the browser suite now runs before every publish; a failure stops the deploy |
| Clean install | Pass: a fresh clone ran the publish job's steps; details below |
| Accessibility and touch | Pass: no serious or critical axe findings on any visited screen; every control is at least 44 px; the Easy flow works by keyboard alone |

## What changed

**Found and fixed by the new checks:**
1. **Unsaved changes could be lost in Easy mode.** If saving failed (for example on a full device), **← Projects**, **Done** and **Edit timing** left the screen without warning. They now ask first ("Stay and retry" / "Leave anyway"), as Editor mode already did.
2. **The reason for a failed save was hidden.** It was only available to screen readers; it is now shown under "Could not save".
3. **No SRT without the video.** When a project's video was missing, Export was switched off. It now opens and offers the SRT, and explains why a video can't be made.
4. **Removing the last speech model left 12 MB behind** (the shared speech runtime). It is now removed with the last model.
5. **Touch targets under 44 px:** the Easy/Editor switch, sub-tabs (In/Out/Loop/Caption), chips, number boxes and timeline blocks (were 30 px tall).
6. **Keyboard:**
   - Groups of choices (looks, presets, fonts, font groups, animation tiles, where the words come from) were one Tab stop per item; the desktop Easy screen needed more than 60 Tab presses to reach **Export video**. Each group is now one Tab stop, with arrow keys, Home and End inside it.
   - Focus now moves to the new heading after each step or screen change, instead of dropping to the top of the page.
7. **Outdated wording:** "Export arrives in a later phase" was still shown after creating text subtitles.
8. **Export file readers** were not released after use.

**Added:**
- **Browser regression suite** (`frontend/e2e/`, Playwright + axe-core) with small committed test videos (MP4, MOV, WebM, MKV, silent MP4, AVI) and a Tamil TXT file. Run with `pnpm --dir frontend e2e`. It runs in CI before every deploy, and a report is kept when it fails.
- **Licence list:** a build step collects every npm package that reaches the site, including libraries compiled inside transformers.js and the speech runtime, and writes their full licence texts. For three packages that ship no licence file, the standard MIT/ISC text is generated with the copyright holder (onnxruntime: Microsoft Corporation).
- **Settings → About and licences** links to the licence list and the font list.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint (frontend + backend) | `pnpm lint` | Pass |
| Types (frontend + backend) | `pnpm typecheck` | Pass |
| Unit tests | `pnpm test` | Pass: frontend 219, backend 96 + 1 skipped |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass |
| Browser suite | `E2E_CHROMIUM=/opt/pw-browsers/chromium pnpm --dir frontend e2e` | Pass: 51 passed, 3 skipped (voice ×2 without model files; keyboard test at phone size, by design) |
| Voice test | same, with `E2E_MODEL_DIR=<whisper-tiny files>` and a 58 s speech clip | Pass (desktop): download, cancel ("nothing changed"), recognise, remove model → storage empty |
| Clean install | fresh `git clone`, then `pnpm --dir frontend install --frozen-lockfile`, lint, typecheck, test, build, e2e | Pass: install 17 s; 219 unit tests; 51 browser checks passed, 3 skipped |

**Not run / limitations:**
- **Real devices.** Not tested on a real iPhone, Android tablet or in Safari. The suite uses desktop Chromium at phone size with touch.
- **H.264, HEVC and AAC.** The test browser can't decode or encode these, so all automated video tests use VP9/Opus. Real iPhone MOVs and H.264 export need checking on the devices.
- **Voice in CI.** The publish job skips the voice test, because it would need the model download.
- **Legacy backend.** It has no new hardening; it is not used by the web app (still waiting on your decision about removing it).

## Decisions made (reversible)

1. Browser checks run before every publish; a failure blocks the deploy.
2. Timeline blocks must be 44 px tall, but may be narrower than 44 px, because their width shows the duration. The subtitle list gives every subtitle a full-size row.
3. The licence list includes everything compiled into the shipped files, even where a library may not strictly need listing.

## Known limitations

- Projects, models, fonts and presets live in one browser on one device.
- No undo yet.
- Still open: may the Python backend be removed?; timing defaults OK?; delete `docs/Test.md` (it is empty)?; **licence choice for the app itself**.

## What I need from you

1. **On her devices:** run the checklist below on the iPhone and the Android tablet. This is the one acceptance step I can't automate.
2. **Decisions:** the app's own licence, and whether to remove the Python backend. For a personal app that others may also use, the usual choices are MIT (anyone may reuse it) or "all rights reserved" (no licence file). Note that mediabunny's MPL-2.0 only requires that its own files stay open, which is already the case.

## Owner review checklist (phone-friendly)

1. Open the site → **Make subtitles** → pick a video from Photos (an iPhone MOV) → **Type or paste** → **Make subtitles**.
2. Pick a look; **More styling** → change the font → **Save as preset**.
3. **Export video** → **Make video** → tap **Cancel** once → **Try again** → **Share or save to Photos/Files**. Does it play in Photos?
4. **Download SRT** and check it opens.
5. Turn on airplane mode and open the app from the Home Screen: it should still open, with your project.
6. Start again with **From the voice** (Base model, about 77 MB once), Tamil.
7. **Settings → About and licences**: the licence list opens.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 7" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
