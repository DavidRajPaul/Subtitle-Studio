# MVP acceptance scenarios (P0)

These are the scenarios the MVP must pass (from [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 6 and the P0 list in [UX_IMPLEMENTATION_PLAN.md](UX_IMPLEMENTATION_PLAN.md)), and how each one is checked. Automated browser checks live in `frontend/e2e/`. They run on the production build in Chromium at phone size (390×844, touch) and desktop size (1400×900), and they run before every publish to GitHub Pages.

**How to run:** `pnpm --dir frontend build` (with `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/`), then `pnpm --dir frontend e2e`.
- Voice test: also set `E2E_MODEL_DIR` to a folder with `Xenova/whisper-tiny/…`.
- To use an already installed Chromium: `E2E_CHROMIUM=/path/to/chromium`.

Two rules are applied on every screen the tests visit:
- **Accessibility:** no serious or critical axe-core findings (WCAG 2.1 A/AA).
- **Touch targets:** every visible button, field and choice is at least 44×44 CSS pixels. Timeline blocks only need the height, because their width is the subtitle's duration. Every block also has a full-size row in the subtitle list.

| ID | Scenario | Checked by |
|---|---|---|
| **A. Opening the app** | | |
| A1 | First visit opens in Easy mode, with no console errors, no sideways scrolling, and passes accessibility and touch-target checks | `app.spec.ts` |
| A2 | After one visit, the app opens again without internet | `app.spec.ts` |
| A3 | Editor mode is one tap away and remembered | `app.spec.ts` |
| A4 | Settings links to the licences of everything the site ships | `app.spec.ts` |
| **B. Choosing a video** | | |
| B1 | MP4, MOV, WebM and MKV open and preview with subtitles drawn | `import.spec.ts` (VP9/Opus files; see limits) |
| B2 | AVI, damaged and empty files are refused with a next step, and another file can be chosen without starting again | `import.spec.ts` |
| B3 | Editor mode shows duration, size, frame rate and audio | `import.spec.ts` |
| B4 | The words step (voice, type, TXT) passes the touch and screen-reader checks | `import.spec.ts` |
| B5 | A video without sound explains why voice can't be used and offers typed words or a TXT file | `import.spec.ts` |
| **C. Words from text** | | |
| C1 | Equal, readable, fit-to-video and manual timing give different, explained results. Readable timing that runs past the video is warned about, not squeezed. | `editor.spec.ts`; exact maths in `src/engine/timing.test.ts` and the Python parity test |
| **D. Words from the voice** | | |
| D1 | One-time model download; recognition can be cancelled with nothing changed; recognition makes subtitles; removing the model frees its storage | `speech.spec.ts` (opt-in: needs model files) |
| **E. Editing** | | |
| E1 | Numeric timing edit. An overlap is warned about, never moved. Regenerating asks before replacing hand-set times. The edit survives a reload. | `editor.spec.ts` |
| **F. Styles and presets** | | |
| F1 | Every style tab is usable at phone and desktop size and changes the picture | `style.spec.ts` |
| F2 | Save a named preset, apply it to another video, rename it, delete it | `style.spec.ts` |
| **G. Export** | | |
| G1 | Export can be cancelled ("nothing was saved"). The MP4 is checked before it is offered. The SRT is UTF-8 with Tamil intact. The stored original is unchanged (SHA-256 before and after). | `export.spec.ts` |
| G2 | Leaving the page while a video is being made asks first | `export.spec.ts` |
| G3 | Editor mode exports through the same panel | `export.spec.ts` |
| **F1. Cutting the video** | | |
| F1.1 | Easy mode trim: the preview length, the SRT times and the exported video all use the trimmed length | `cut.spec.ts`; exact SRT checked |
| F1.2–F1.5 | Editor: split twice and delete the middle part (asking first if subtitles would go). Playback never shows the cut-away time. Export works. The part can be put back. | `cut.spec.ts`; cut logic in `src/lib/cuts.test.ts`, panel in `CutPanel.test.tsx` |
| **H. Storage** | | |
| H1 | Deleting a project also deletes its stored video | `editor.spec.ts` |
| **K. Keyboard** | | |
| K1 | The whole Easy flow works with the keyboard alone, with visible focus. Each group of choices is one Tab stop, with arrow keys inside it. | `keyboard.spec.ts` (desktop) |
| **X. Failures** | | |
| X1 | Storage full: the reason is shown, leaving asks first, and Retry saves once there is space | `failures.spec.ts` |
| X2 | Private browsing that blocks storage is explained, with a next step | `failures.spec.ts` |
| X3 | A project whose video is gone keeps its subtitles and can still save the SRT | `failures.spec.ts` |
| X4 | A failed model download says why and can be retried. Cancelling a download keeps nothing. | `failures.spec.ts` |
| X5 | A browser that can't make videos says so and still offers the SRT | `failures.spec.ts` |
| **Clean install** | | |
| I1 | A fresh clone installs from the lockfile, then lints, type-checks, tests and builds exactly as the publish job does | Manual run, recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); repeated by every publish |

## What these checks cannot prove

- **Real devices.** The tests use desktop Chromium pretending to be a phone, not Safari on an iPhone or Chrome on an Android tablet. Those are reviewed by hand with the checklist in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
- **H.264, HEVC and AAC.** The test browser can't decode or encode these, so the test videos are VP9/Opus, and real iPhone MOVs (H.264/HEVC) are checked on the devices.
- **Voice in CI.** The voice test needs the model downloaded, so the publish job skips it. It is run by hand before each report.
