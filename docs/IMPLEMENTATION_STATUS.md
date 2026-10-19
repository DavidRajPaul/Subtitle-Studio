# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**Easy mode (default) + style tools.** Built and verified in a real browser at phone and desktop size; awaiting review on her iPhone and Android tablet.

Requested by the owner after Stage 2: "keep every change as it is; have an easy mode and an editor mode, easy mode selected by default; lots of fonts and styling options, like the attached screenshots." The owner chose: Easy flow *video → words → look*; all four styling areas (fonts + Add Font, colours/stroke/shadow/box, animations, size/spacing/alignment). Order was left open, so export moves to the next stage and is designed to reproduce every style.

Stages: 1 text on Pages ✓ · 2 speech in the browser ✓ · **Easy mode + styles (this stage)** · next: export (SRT, then MP4 with burned-in subtitles).

## Acceptance criteria

| Criterion | Result |
|---|---|
| Everything built so far still works | Pass: all earlier tests kept and passing; Editor mode unchanged apart from the new Style tab |
| Easy mode is selected by default; Editor mode one tap away (remembered) | Pass |
| Easy: video → words (voice / type or paste / TXT) → look; automatic timing; saved automatically | Pass (browser test, both sizes, real Whisper-tiny for voice) |
| Lots of fonts, including Tamil, searchable, Add Font | Pass: 54 bundled fonts (12 Tamil), groups, search, recently used, add your own TTF/OTF/WOFF |
| Styling like the screenshots | Pass: Looks · Animation (In/Out/Loop/Caption) · Font · Size (Title/Subtitle/Content) · Colour (T chips; Text/Stroke/Shadow/Background with opacity) · Align · Spacing |
| What you see is what export will make | Preview now uses one canvas renderer that the export stage will reuse |

## What changed

- **Modes:** an Easy | Editor switch in the top bar. Easy is the default; an explicit choice is remembered in this browser. Switching mode keeps an open project open.
- **Easy mode:**
  - *Home:* "Subtitles in three steps" plus your projects.
  - *Step 1:* pick an MP4.
  - *Step 2:* the words. **From the voice** (on-device recognition; Tamil by default; one-time model download offered inline), **Type or paste** (one subtitle per line; a single paragraph is split into sentences), or **A TXT file**. Timing is automatic: spread across the video, or reading speed if the video is too short for that many subtitles.
  - *Step 3:* **Pick a look** (15 looks drawn live), **More styling** (all tools), **Fix words** (change text without touching timing), **Edit timing in Editor mode**, **Done**. Export is shown as coming next.
- **Style tools** (Easy mode, and Editor mode's Style tab): Looks, Animation, Font, Size, Colour, Align, Spacing, laid out like the screenshots, with every slider also editable as a number.
- **New style options:**
  - text/stroke/shadow opacity; shadow colour, blur and distance (glow)
  - box padding and corner rounding
  - text box width; letter and line spacing; ALL CAPS
  - animations: In/Out (fade, scale, spin, slide, reveal, gradient) with durations; Loop (pulse, bounce, float, shake, wobble); Caption (highlight, pop, word by word, with highlight colour)
- **Older projects look the same:** the original style fields keep their values and new options default to "off".
- **Fonts:**
  - built from Fontsource at build time (two weights; Latin, Tamil and Devanagari subsets; each licence copied alongside)
  - loaded only when used
  - Noto Sans Tamil / Devanagari always stand behind a Latin-only font, so Tamil never shows as boxes
  - fonts she adds are stored in this browser
  - full list: [FONTS.md](FONTS.md)
- **Renderer** (`src/engine/render/`): canvas drawing with wrapping that keeps Tamil letters whole, stroke, shadow/glow, rounded boxes, spacing (emulated where the browser lacks it) and deterministic animation maths.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | Pass |
| Types | `pnpm typecheck` | Pass |
| Tests | `pnpm test` | Pass: frontend 177, backend 96 + 1 skipped |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Production build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass: main 352 KB (96 KB compressed); fonts 5 MB, loaded per font on demand; site about 20 MB |
| Browser run | Playwright + Chromium on the production build, 390×844 touch and 1400×900; real Whisper-tiny weights for voice | Pass |

**Browser run details (both sizes):**
- Easy is the default.
- Typed Tamil + English lines → "Pick a look".
- Five looks drew text on the video (pixel check), with correct Tamil shaping.
- The Pop look's scale-in measurably grew between 0.05 s and 1 s.
- Style sheet tabs captured.
- Voice route: a 57.6 s clip gave 11 subtitles in about 15 s ("and welcome to the channel.").
- Switching to Editor kept the project open.
- 31–35 font files loaded, 0 failed, no console errors, no sideways scrolling.

**Found and fixed during testing:**
- Choosing a look with an entrance animation while paused at 0:00 showed nothing (the subtitle had not appeared yet). It now jumps to a moment where the subtitle is fully shown.
- Look thumbnails had unreadably small text.
- The "The words" label was beside its box instead of above it.

**Not run / limitations:**
- Not tested on a real iPhone, Android tablet or in Safari.
- Safari before version 18 has no canvas letter spacing; an emulation is used there but has not been seen in Safari.
- Word-by-word captions spread words evenly by length (no per-word speech timing), so they follow speech closely but not exactly.
- Export (making the final video) is the next stage.

## Decisions made (reversible)

1. Remember an explicit Editor choice; otherwise Easy.
2. Easy text timing: Fit to video, falling back to readable speed if the video is too short.
3. New Easy projects use the look chosen last time (Classic at first). Editor-mode projects keep the original default style.
4. Sizes stay a share of the frame height (as before), so earlier projects look the same.
5. Font licences: only SIL OFL 1.1 and Apache-2.0 fonts are bundled.

## Known limitations

- Projects, models and added fonts live in one browser on one device.
- No undo yet (the editor dialogs say so).
- Still open: may the Python backend be removed?; timing defaults OK?; delete `docs/Test.md`?; licence choice for the app itself.

## What I need from you

On her phone/tablet: tap **Make subtitles**, try **Type or paste** and **From the voice**, try several looks and **More styling**, and tell me what feels confusing or missing (screenshots help).

## Owner review checklist (phone-friendly)

1. Open the app: **Easy** is selected; tap **Make subtitles**.
2. Pick a video → **Next: the words** → **Type or paste** a few Tamil lines → **Make subtitles**.
3. Tap different looks; press **Play** to see animations.
4. **More styling** → Font (try Tamil fonts, search, Add Font), Animation, Colour, Size, Align, Spacing.
5. **Fix words** → change a word → ✓ Saved.
6. **Edit timing in Editor mode**: the same project opens in Editor mode.
7. Start again with **From the voice** (download Base once).

PHASE GATE: I will not begin the next stage until you explicitly approve it. Reply "Approved. Proceed to export" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
