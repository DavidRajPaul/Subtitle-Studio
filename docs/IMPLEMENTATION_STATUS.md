# Implementation Status

**Last updated:** 2026-10-26 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**Video editor roadmap, phase F1: cut the video.** Built and verified in a real browser at phone and desktop size; awaiting review on her iPhone and Android tablet.

Requested by the owner on 2026-10-26: list every feature of a popular mobile video editor, split them into ordered phases and tasks, add an implementation checklist to the README without naming that product, and start with the most-used features.

**Flagged decisions:**
- **No reverse engineering.** The owner pointed to a binary reverse-engineering toolkit. I did not use it on the other product, and nothing was copied from it (no code, templates, effects, stickers or music). That product's terms forbid reverse engineering, and its code and assets are copyrighted; the toolkit's own disclaimer rules out the same thing. The feature list comes only from that product's **public** help, product and tutorial pages, and everything is written from scratch. No product name appears in the repository.
- **Local-only rule kept.** Features that need servers, licensed libraries or very large AI models are listed as ○ (not planned) in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md), phase F12.
- **Easy mode stays simple.** It gets only **Trim video**; the full cutting tools are in Editor mode.

Previous stages: text, speech, Easy mode + styles, export, formats + presets, Phase 6 hardening ✓ (all still awaiting her device review).

## Roadmap

- [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md): every feature, grouped into phases F1–F12 and ordered by usage. Each feature is marked ● (fully on the device), ◐ (on the device, with limits) or ○ (not planned).
- README → "Implementation cycle": the checklist of 62 tasks, and the cycle each phase follows.

## Acceptance criteria (F1)

| Criterion | Result |
|---|---|
| F1.1 Trim start and end, by typed times or from the playhead | Pass (Easy and Editor) |
| F1.2 Split at the playhead; delete a part | Pass |
| F1.3 Delete before / after the playhead | Pass |
| F1.4 Put a deleted part back | Pass |
| F1.5 Preview skips deleted parts | Pass: while playing, the video never showed the cut-away time (sampled every 20 ms) |
| F1.6 Export the cut version | Pass: picture re-encoded, sound copied packet by packet; length checked before success |
| Cutting never silently erases subtitles | Pass: lists which subtitles would go and asks ("Cut anyway" / "Keep them"); later subtitles move up; crossing ones are shortened and counted |
| One subtitle model; original untouched | Pass: subtitles live on the cut timeline used by the preview, SRT and video; cuts are a list of kept parts, and the original file is only read |
| Older projects | Pass: projects without cuts open as the whole video |

## What changed

- **`src/lib/cuts.ts`:** pure, integer-millisecond logic for split, remove, trim, restore, mapping between the cut timeline and the original, and validity checks. 13 tests.
- **Project model:** an optional `parts` list (kept parts of the original), checked on load like every other field.
- **Cut panel** (`CutPanel.tsx`):
  - Editor mode: **Cut video** (side panel on computers, a sheet on phones), with trim, split, delete this part, delete before / after the playhead, the list of parts, and the cut-away parts with **Put back**.
  - Easy mode: **Trim video**, with trim and Put back only.
- **Preview:** follows the kept parts, jumps over deleted ones, and shows cut-timeline times. The timeline marks each cut with a dashed line.
- **Export:** a new path for cut videos (`engine/export/cutExport.ts`). It decodes only the kept ranges, draws subtitles at cut-timeline times, and re-encodes the picture. The sound is copied as is, or re-encoded only when MP4 can't hold it. Uncut videos use the existing export path, unchanged.
- **Timing:** checks, warnings and "Regenerate timing" use the cut length.
- **Fixed during testing:**
  - The "to" box was renamed "Keep until"; the bare label was unclear to screen readers.
  - Removed subtitles are now listed in video order.
  - A focus bug from Phase 6: moving focus to the new heading could take focus away from someone already tabbing. Focus now moves only when it has actually been lost.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint, types (frontend + backend) | `pnpm lint`, `pnpm typecheck` | Pass |
| Unit tests | `pnpm test` | Pass: frontend 240, backend 96 + 1 skipped |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass |
| Browser suite | `pnpm --dir frontend e2e` | Pass: 55 passed, 3 skipped (voice ×2 without model files; keyboard at phone size) |
| Independent file check | 10 s counter video, keep 0–3 s and 7–10 s, export, then ffprobe/ffmpeg | Video 6.000 s, sound 6.027 s (the extra 27 ms comes from sound packet boundaries), decodes cleanly. Frames either side of the cut show the original's seconds 2 and 7, and the subtitles change from "B" to "D" ("C" was inside the deleted part). |

**Not run / limitations:**
- Not tested on her real iPhone or tablet. The test browser can't decode or encode H.264, so test videos are VP9/Opus.
- During preview, the jump over a deleted part can show up to about one frame of it on a slow device, and may pause briefly while the browser seeks. The exported video has no such glitch.
- Sound is cut at packet boundaries (about 20 ms), so a cut can be up to one packet off. There is no cross-fade at cuts yet; that arrives with F2 (fades).
- Subtitles removed by a cut don't come back when the part is put back. The app says so before cutting.
- No drag handles for trimming yet (planned with the multi-clip timeline, F5).

## Known limitations

- Projects, models, fonts and presets live in one browser on one device.
- No undo yet (F5.4); "Put back" covers cuts.
- Still open: may the Python backend be removed?; timing defaults OK?; delete the empty `docs/Test.md`?; licence choice for the app itself.

## What I need from you

1. **On her phone:** open a project, tap **Trim video**, keep a middle stretch, then export. Does the saved video start and end where she chose?
2. **In Editor mode:** **Cut video** → **Split here** twice → **Delete this part** → play it back.
3. **The roadmap order:** look at [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md). The next phase is **F2, music and sound**. If she would rather have something else sooner (speed, canvas size, stickers), say so.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to F2" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
