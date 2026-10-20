# Implementation Status

**Last updated:** 2026-10-20 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**More video formats and named style presets.** Built and checked in a real browser at phone size; awaiting review on her iPhone and Android tablet.

Requested by the owner after the export stage: "I want multiple input video format support… mov, mp4 and other popular formats. Also I want to add preset options… The preset must have a preset name… the user must be able to select from it and it must apply for his current video. The preset must include the font style, font, and all other styling options."

Stages: 1 text on Pages ✓ · 2 speech in the browser ✓ · Easy mode + styles ✓ · export ✓ (awaiting device review) · **formats + presets (this stage)** · next: hardening and MVP acceptance (Phase 6).

## Acceptance criteria

| Criterion | Result |
|---|---|
| Everything built so far still works | Pass: all earlier tests kept. Changed only where MP4-only behaviour was the point (a test that refused MOV now accepts it; the picker test selector). |
| Opens MOV, MP4, M4V, WebM, MKV and 3GP | Pass: real files of each are read in tests. MOV, MKV and WebM were taken through pick → preview → export in a browser. |
| Formats browsers cannot read are refused with a next step | Pass: AVI, WMV, FLV and similar get "cannot be opened in a browser. Convert it to MP4 first…" |
| Voice route works with the new formats | Pass: if the browser cannot read the sound directly, it is extracted another way. Tested by forcing that failure on an MKV: 9 subtitles. |
| After an edit, offer to save a preset if not already saved | Pass: "This style is not a preset yet… **Save as preset**". It changes to "✓ Preset: name" when the style matches a preset. |
| Presets have a name | Pass: required, up to 40 characters, unique (letter case ignored). A free "My style N" is suggested. |
| Select a preset to apply it to the current video | Pass: under **My presets** at the top of Looks, in Easy mode, the Style sheet and Editor mode |
| Preset includes the font and every other style option | Pass: the whole style is stored (font, bold/italic, size, colours and opacity, stroke, shadow and glow, box, position, alignment, width, spacing, case, animations). The browser test confirmed a font change and a colour change came back exactly. |
| Rename, update and delete presets | Pass: **⋯** on a preset opens Rename, Replace with the current style, and Delete… (asks first). Videos already using the style keep it. |

## What changed

- **Formats:**
  - Video inspection now uses mediabunny (already used for export) instead of mp4box, which has been removed.
  - The file pickers accept `.mp4,.mov,.m4v,.webm,.mkv,.3gp,video/*`. The `video/*` entry lets phones offer their photo library.
  - Files are recognised by their content, not their name.
  - Project names drop any extension. A missing file type is filled in from the extension, so the stored copy plays later.
  - The voice route has a fallback that extracts the sound as 16 kHz WAV when the direct reader fails.
  - The message for videos the device cannot play now says what to do and no longer claims export would still work.
- **Presets** (`api/presets.ts`, `components/style/Presets.tsx`, `hooks/usePresets.ts`):
  - Stored in this browser's database (new `presets` store, database version 3).
  - Each preset is checked with the same rules as project styles. Older presets get newer options filled in; damaged ones are skipped.
  - Matching ignores the order in which settings are stored.
  - Choosing a preset makes it the starting look for her next Easy project. If it is deleted later, the default look is used.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | Pass |
| Types | `pnpm typecheck` | Pass |
| Tests | `pnpm test` | Pass: frontend 218, backend 96 + 1 skipped |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Production build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass |
| Browser runs | Playwright + Chromium on the production build, 390×844 touch | Pass (below) |

**Formats (browser):**

| File | Result |
|---|---|
| QuickTime-branded MOV (VP9 + Opus), portrait | Opened, previewed with subtitles, exported 720×1280 6 s with sound |
| MKV (VP9 + Opus) | Opened, previewed, exported 1280×720 8 s with sound |
| WebM (VP9 + Opus) | Same |
| Real H.264 + AAC MOV (this test browser cannot decode H.264) | Clear message: cannot be previewed or exported on this device, try another device or convert to MP4 (H.264) |
| AVI | Refused before reading: "AVI videos cannot be opened in a browser. Convert it to MP4 first…" |

All three exports decoded end to end in ffmpeg with no errors. There were no console errors and no sideways scrolling.

**Presets (browser, phone size):**
1. Edited the colour and font (Mukta Malar), then **Save as preset**. "My style 1" was suggested; renamed it "Wedding Tamil" and saved → "✓ Preset: Wedding Tamil".
2. Switched to Neon → the bar offered saving again. Tapped the preset → the style came back (different pixels drawn) and "✓ Preset" showed.
3. Reloaded the page → the preset was still there, and a new project started with it.
4. Renamed it to "Wedding", then deleted it after the confirmation → "No presets yet".

**Found and fixed during testing:**
- The preset **⋯** button covered part of the preview text. It now sits beside the name.
- The preset name boxes were unstyled.
- The old "cannot play this format" message wrongly said export would still work.

**Not run / limitations:**
- Not tested on a real iPhone, Android tablet or in Safari. Real iPhone MOVs are H.264 or HEVC, which this test browser cannot decode, so real MOV playback and export need checking on her devices.
- Whether a file plays depends on the device's decoders. HEVC (newer iPhones) plays in Safari, but on Android only where the device supports it.
- Presets live in one browser on one device, like projects. There is no export or import of presets yet.
- The SRT export does not include styles, so presets affect only the MP4 and the preview.

## Decisions made (reversible)

1. Supported formats: MP4, MOV, M4V, WebM, MKV, 3GP. MPEG-TS (.ts/.mts) is refused for now (common from camcorders but rarely from phones).
2. Show "Save as preset" whenever the current style doesn't match a preset, even if it matches a ready-made look.
3. Newest presets first.
4. Deleting a preset never changes videos that already use its style.

## Known limitations

- Projects, models, added fonts and presets live in one browser on one device.
- No undo yet.
- Still open: may the Python backend be removed?; timing defaults OK?; delete `docs/Test.md`?; licence choice for the app itself.

## What I need from you

On her iPhone, pick a video from the photo library (a MOV) and export it. On the Android tablet, try a video from the gallery. Then save a preset, open another video and apply it. Tell me what worked and what didn't (screenshots help).

## Owner review checklist (phone-friendly)

1. **Make subtitles** → **Pick a video** → choose an iPhone video (MOV) → words → look.
2. Check the preview shows the subtitles, then **Export video** → **Make video** → save it to Photos.
3. Tap **More styling**, change the font and a colour → **Save as preset** → type a name → **Save preset**.
4. Start a new video: it begins with your preset. Tap a ready-made look, then your preset under **My presets** to switch back.
5. Tap **⋯** on the preset: rename it, then try **Delete…** (it asks first).
6. Optional: try an AVI file and check the message makes sense.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 6" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
