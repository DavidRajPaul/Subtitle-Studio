# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**Export: SRT file and MP4 with subtitles burned in, made in the browser.** Built and checked in a real browser at phone and desktop size; awaiting review on her iPhone and Android tablet.

Stages: 1 text on Pages ✓ · 2 speech in the browser ✓ · Easy mode + styles ✓ · **export (this stage)** · next: hardening and MVP acceptance (Phase 6).

## Acceptance criteria

| Criterion | Result |
|---|---|
| Everything built so far still works | Pass: all earlier tests kept and passing. The only test changed is the one that checked Export was switched off. |
| UTF-8 SRT export | Pass: standard `HH:MM:SS,mmm` times, sorted, Windows line endings, empty or broken subtitles left out and counted |
| MP4 with the subtitles burned in, made on the device | Pass: each frame drawn with the same renderer as the preview (fonts, colours, stroke, shadow, boxes, animations), then encoded by the browser; sound copied unchanged |
| Available from Easy and Editor modes | Pass: **Export video** (Easy) and **Export** (Editor) open the same panel |
| Progress, time estimate, cancel | Pass: percentage, "about N minutes left", **Cancel** → "Export cancelled. Nothing was saved." Screen kept awake while it runs. |
| Output checked before success | Pass: the new file is re-opened and must have video, its sound (if the original had sound) and the original's length; otherwise an error with a next step |
| Original never changed; output name never the original's | Pass: the source is only read; files are named `<project name> - subtitles.mp4/.srt` |
| Every state has a next action | Pass: unsupported browser, unreadable video format, stalled export and failed check each explain what to do, and the SRT stays available |

## What changed

- **Export panel** (`components/ExportPanel.tsx`):
  - two sections: *Video with subtitles (MP4)* and *Subtitle file (SRT)*
  - timing warnings are counted before exporting (export is still allowed)
  - the result shows length, size, resolution and whether it has sound, with a preview player
  - **Share or save to Photos/Files** on phones that support sharing files; **Download** everywhere
- **Video engine** (`engine/export/videoExport.ts`, using mediabunny):
  - Video formats tried in order: H.264 → HEVC → VP9 → AV1. If the result isn't H.264, a note says where it may not play.
  - Phone rotation is baked into the picture, so portrait videos stay upright.
  - Every font and glyph the subtitles need is loaded before the first frame.
  - A stall guard stops a run that makes no progress for a minute, and says so.
  - mediabunny loads only when someone exports (149 KB compressed), so the app doesn't open any slower.
- **SRT writer** (`engine/export/srt.ts`), **file helpers** (`lib/saveFile.ts`), `loadMediaBlob` in `api/media.ts`, `pause()` on the preview handle.
- **Architecture change (flagged):** ADR-001 planned FFmpeg compiled to WebAssembly for burn-in. I used the browser's built-in encoder (WebCodecs) instead. Phone hardware encoders are much faster, and the download is about 150 KB instead of about 30 MB. The trade-off: the output format depends on what the device can encode. ADR-001 is updated.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | Pass |
| Types | `pnpm typecheck` | Pass |
| Tests | `pnpm test` | Pass: frontend 193, backend 96 + 1 skipped |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Production build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass: main 359 KB (99 KB compressed); export chunk 588 KB (149 KB compressed), loaded on demand |
| Browser export | Playwright + Chromium on the production build | Pass (details below) |

**Browser export details:**

| Clip | Size | Result |
|---|---|---|
| Portrait VP9 + Opus, 6 s, Boxed look | phone 390×844 | Cancel worked ("Nothing was saved"), then made in 3.5 s: 720×1280, 6.0 s, with sound |
| Landscape clip with a 90° phone-rotation tag, 8 s, Neon look | desktop 1400×900 | Made in 9.2 s: upright 720×1280, 8.0 s, Opus sound kept |
| Speech clip, 58 s, Karaoke look | desktop | Made in 9.6 s, with sound |
| H.264 + AAC (this test browser cannot decode H.264) | desktop | After 0.5 s: "This browser cannot read this video's format…", and the SRT was still offered |

- Independent checks with ffprobe/ffmpeg: duration matches the original, sound kept, both files decode end to end with no errors. Frames pulled at 0.9 s and 3 s show the subtitles in the picture, with correct Tamil shaping and the chosen look.
- The SRT downloads were named `<name> - subtitles.srt` and began `1\r\n00:00:00,000 --> …`.
- No console errors.

**Found and fixed during testing:**
- With a video the browser couldn't decode, the export sat at "Getting ready…" with no message. It now explains the problem immediately. A one-minute stall guard also covers any other hang.

**Not run / limitations:**
- Not tested on a real iPhone, Android tablet or in Safari. The test browser cannot encode H.264, so every test output was VP9. Real Chrome on Android and Safari on iPhone normally encode H.264; this needs confirming on her devices.
- The whole new video is held in memory until it is saved. Very long or 4K videos may fail on a phone; the error says to try a shorter clip.
- iPhone needs iOS 17 or later (WebCodecs video). Older browsers are told so and can still save the SRT.
- Export runs only while the app is open and on screen, especially on iPhone.
- The SRT holds text and timing only. Looks and animations exist only in the MP4.

## Decisions made (reversible)

1. Use WebCodecs through mediabunny instead of FFmpeg in WebAssembly (see above).
2. Keep the original resolution and frame rate, at "high" quality.
3. Copy the sound unchanged. If the device can't keep it, refuse rather than make a silent video.
4. Allow export despite timing warnings, but show the count first.

## Known limitations

- Projects, models and added fonts live in one browser on one device.
- No undo yet.
- Still open: may the Python backend be removed?; timing defaults OK?; delete `docs/Test.md`?; licence choice for the app itself.

## What I need from you

On her iPhone and Android tablet, export one short video. Tell me whether the result note mentions H.264 or not, and whether **Share or save to Photos/Files** puts the video where she expects.

## Owner review checklist (phone-friendly)

1. Open a project (or make one: **Make subtitles** → video → words → look).
2. Tap **Export video**. The panel says the original is not changed and nothing is uploaded.
3. Tap **Make video**. Watch the progress and the time left; try **Cancel** once, then **Try again**.
4. When it says **ready and checked**, play the preview. The subtitles should look exactly like the app's preview.
5. Tap **Share or save to Photos/Files** (phone) or **Download video**, then open it in Photos or Files.
6. Tap **Download SRT** and check the file opens (for example in VLC or YouTube Studio).
7. In Editor mode, tap **Export** in the top bar: it's the same panel.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 6" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
