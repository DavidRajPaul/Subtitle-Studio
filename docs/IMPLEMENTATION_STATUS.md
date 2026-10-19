# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main` · **Live:** https://davidrajpaul.github.io/Subtitle-Studio/

## Current work

**Browser-only web app — Stage 2: speech recognition in the browser.** Built and verified with the **real Whisper-tiny model** in Chromium; awaiting owner review on her iPhone and Android tablet.
Decision record: [ADR-001](ADR-001-browser-only-web-app.md). Stage 1 (text workflow on Pages) was approved.

Stages: 1. text workflow on Pages (done) · **2. speech in the browser (this stage)** · 3. export in the browser (SRT, then burned-in MP4).

## Acceptance criteria for stage 2

| Criterion | Result |
|---|---|
| Speech recognised on the device, no server | Pass: real Whisper-tiny ran in a Web Worker (transformers.js + ONNX Runtime WebAssembly); no requests to any site except the one-time model download |
| Video's own audio, or a separate MP3 | Pass: MP4 (desktop test) and silent MP4 + MP3 (phone test) |
| Model downloaded once, on request, with progress; failures explained | Pass: Download in Settings or in the speech screen; a failed download says what to do and keeps nothing half-installed |
| Progress, time estimate and Cancel | Pass: "Recognising speech… less than a minute left (52%)"; Cancel says nothing was changed |
| Works offline once the model is downloaded | Pass: re-ran recognition with the network off |
| Result opens in the editor as editable subtitles | Pass: 11 cues, saved, editable |

## What changed

- **`frontend/src/engine/`** (new): `whisper.worker.ts` (runs Whisper), `speechEngine.ts` (worker, model cache, progress), `audioDecode.ts` (browser decodes MP4/MP3 audio → 16 kHz mono), `chunking.ts` (≤30 s windows cut at the quietest moment; silent windows skipped because Whisper invents text for silence), `speechCues.ts` (segments → cues, ported from Python), `speechModels.ts` (Tiny 41 MB, Base 77 MB, Small 250 MB; 24 languages).
- **`api/speech.ts`** now runs everything in the browser with a small job list, so the Phase 4 speech screens, progress and cancel work unchanged.
- **Speech screens** are back in the import flow and Settings, with browser wording ("recognised on this device… your audio is not sent anywhere"), an iPhone memory note for Small, and realistic timing advice.
- **Repetition guard:** Whisper can loop ("to do the best to do the best…"); `no_repeat_ngram_size: 3` stops it (seen and fixed during testing).
- **Engine files self-hosted:** ONNX Runtime's 14 MB WebAssembly file is copied into the site at build time (`scripts/copy-ort.mjs`) instead of loading from a third-party CDN; unused 27 MB variants are left out. Published site: about 15 MB.
- **Offline fix (also affected stage 1):** the service worker now stores the start page and its files when it installs, and ignores `Vary` when serving them. Before this, the app opened offline only if the page had been reloaded once.
- Docs: ADR-001, README (status, licences), this file.

## Checks run and results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | Pass |
| Types | `pnpm typecheck` | Pass |
| Tests | `pnpm test` | Pass: frontend 142, backend 96 + 1 skipped |
| Production build | `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm --dir frontend build` | Pass: main 255 KB; speech worker 558 KB and engine 14 MB load only when speech is used |
| Audit | `pnpm --dir frontend audit` | No known vulnerabilities |
| Real end-to-end | Playwright + Chromium on the production build, 1400×900 and 390×844 touch; real Whisper-tiny files (from an npm copy of `Xenova/whisper-tiny`, since huggingface.co is blocked in my sandbox) answered in place of Hugging Face | Pass |

End-to-end details (both sizes): Download Tiny in Settings → "Installed · 42 MB"; Small (not available locally) → clear failure with "Try the download again"; Transcribe a 57.6 s English clip (10 sentences) → **19 s** on this machine → "11 subtitles recognised in English", e.g. "and welcome to the channel." / "Today, we will learn about the history of South India." / "Many of these temples still stand today." / "Please subscribe for more.", with two garbled lines; opened in the editor and saved; offline: cancel worked, and a full re-run worked; only `ort/ort-wasm-simd-threaded.wasm` was loaded; no console errors; no sideways scrolling.

**Accuracy note (real model, synthetic voice):** Tiny on a robotic Tamil sample gave "வருக்கம் வராக்…" for "வணக்கம் நண்பர்களே…": not usable. For Tamil, **Small** is needed (recommended in the app); real voices are usually recognised better than synthetic ones.

**Not run / limitations of testing:**
- **Not tested on a real iPhone, Android tablet or in Safari.** Phones are slower than this machine (expect a few times the clip length with Base, much longer with Small), and Small may exceed an iPhone's memory.
- Base and Small were not run (only Tiny was available offline here); their sizes were checked against Hugging Face.
- The speech engine uses a single thread (GitHub Pages cannot enable multi-threading).

## Licences (new)

transformers.js (Apache-2.0), ONNX Runtime Web (MIT), @huggingface/tokenizers (Apache-2.0), @huggingface/jinja (MIT); Whisper model weights (MIT, OpenAI; Xenova conversions), downloaded by the user, never bundled.

## Decisions made (reversible)

1. WebAssembly on all devices (no WebGPU yet): predictable and smaller downloads; WebGPU could speed up tablets later.
2. 8-bit models from `Xenova/whisper-*` (the format verified end-to-end here).
3. Default Base; Small recommended for Tamil; Medium/Large not offered (too heavy for phones).
4. Silent windows skipped; anti-repetition setting on.

## Known limitations

- Speech is slow on phones; keep the screen open while it runs (a phone may pause it if the app goes to the background).
- No word-level timing: long sentences stay as one subtitle (the editor warns if too long).
- Projects and models live in one browser on one device.
- Still open: no undo; timing defaults OK?; delete `docs/Test.md`?; create the architecture docs?; licence choice; **may I remove the Python backend now that speech works in the browser?**

## What I need from you

1. On her iPhone and tablet, open the link (from the Home Screen icon), go to **Settings → Speech models**, and download **Base** (and **Small** on the tablet).
2. **Transcribe speech** with a short real clip (30–60 s) in English and in Tamil; note how long it takes and how good the text is.
3. Tell me whether to remove the Python backend.

## Owner review checklist (phone-friendly)

1. Settings → Speech models → Download Base: the progress shows MB; it ends with "Installed".
2. Home → Transcribe speech → pick an MP4 with someone talking → Spoken language → Transcribe: progress with a time estimate; try Cancel once.
3. Transcribe again → Result → Open in editor → fix a word → ✓ Saved.
4. Aeroplane mode → transcribe again: it still works.
5. A silent MP4 + an MP3 of the voice also works.

PHASE GATE: I will not begin the next stage until you explicitly approve it. Reply "Approved. Proceed to Stage 3 (export in the browser)" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
