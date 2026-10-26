# Video editor feature roadmap

**Goal:** grow Subtitle Studio from a subtitle tool into a complete short-video editor, one phase at a time, without giving up its rules:
- Everything runs on the device; no uploads, accounts or cloud processing.
- The original video is never changed.
- Easy mode stays simple; new tools go into Editor mode first.

**How the list was made.** We read the public help pages, product pages and tutorials of popular mobile and desktop video editors and collected every feature they describe. Only the *ideas* are used. Every feature here is designed and written from scratch for this app. No other product's code, templates, effects, stickers, music or other assets are copied, decompiled or reused.

**Order.** No editor publishes usage figures, so phases follow what those editors' own guides call the basics: cutting (trim, split, delete), text and captions, music, frame size, speed. Then come the tools that tutorials teach next, and AI tools last. Features this app already has are marked ✓.

**Feasibility:**
- **●** Can be built fully on the device.
- **◐** Can be built on the device, with limits (noted).
- **○** Needs servers, licensed content, or AI models too large for a phone. Listed for completeness, not planned.

The live checklist of what is done is in the README ("Implementation cycle"). Each phase follows the same cycle:
1. State the scope.
2. Build it.
3. Add unit and browser tests.
4. Update the docs.
5. Publish.
6. The owner reviews it on her phone and tablet.
7. Approve, then the next phase starts.

---

## Already in the app (before this roadmap)
- ✓ Auto captions from speech, on the device, Tamil and 23 other languages ●
- ✓ Captions from typed text or a TXT file, with four timing modes ●
- ✓ Caption styling: 54 fonts plus your own fonts, colours, stroke, shadow and glow, box, spacing, alignment, size ●
- ✓ Caption animations: in, out, loop, word-by-word, highlight and pop ●
- ✓ 15 ready-made looks, plus named presets ●
- ✓ Numeric timing editor, timeline, overlap warnings ●
- ✓ Export: SRT, and MP4 with subtitles burned in, checked before it is offered ●
- ✓ Opens MP4, MOV, M4V, WebM, MKV and 3GP; works offline; saves projects automatically ●

---

## F1 · Cut the video (most used) — ✓ built
| # | Task | Notes | |
|---|---|---|---|
| F1.1 | **Trim** the start and end of the video, by typing exact times or setting them from the playhead (drag handles come with the multi-clip timeline, F5) | Also covers "export only part of a video" | ● |
| F1.2 | **Split** at the playhead and **delete** a part | Subtitles inside a deleted part are removed after a warning; later ones move up | ● |
| F1.3 | **Delete left / delete right** of the playhead | | ● |
| F1.4 | **Restore** a deleted part | Cuts never touch the original file | ● |
| F1.5 | Preview plays the cut version, skipping deleted parts | | ● |
| F1.6 | Export the cut version: picture re-encoded, sound copied as is | SRT and MP4 use the cut timeline | ● |

## F2 · Music and sound
| # | Task | Notes | |
|---|---|---|---|
| F2.1 | Add background music from her own files (MP3, M4A, WAV) | No stock music library ○: licensed | ● |
| F2.2 | Volume for the video's own sound and for the music; mute the original | | ● |
| F2.3 | Fade in / fade out | | ● |
| F2.4 | Trim and move the music | | ● |
| F2.5 | Record a voice-over with the microphone | | ● |
| F2.6 | Save the sound only (extract audio) | WAV or M4A; MP3 needs an encoder ◐ | ◐ |
| F2.7 | Sound effects from her own files | No built-in library ○ | ● |
| F2.8 | Simple voice effects: echo, deep, high, robot | Web Audio | ● |

## F3 · Frame size and canvas
| # | Task | Notes | |
|---|---|---|---|
| F3.1 | Aspect ratio: 9:16, 16:9, 1:1, 4:5, 4:3, original | | ● |
| F3.2 | Fit or fill; position and zoom the video in the frame | | ● |
| F3.3 | Background for empty space: colour, blurred video, image | | ● |
| F3.4 | Crop, rotate 90°, flip (mirror) | | ● |
| F3.5 | Social presets (Shorts, Reels, Status, YouTube) on export | | ● |

## F4 · Speed
| # | Task | Notes | |
|---|---|---|---|
| F4.1 | Constant speed 0.1× to 10×, slow motion | Pitch kept where the browser allows ◐ | ◐ |
| F4.2 | Reverse a part | Needs the whole part decoded; limited on phones for long parts | ◐ |
| F4.3 | Freeze frame | | ● |
| F4.4 | Speed curves (ramp presets: montage, hero, bullet, flash in/out) | | ● |

## F5 · Several clips and photos
| # | Task | Notes | |
|---|---|---|---|
| F5.1 | Add more videos and photos to one project; photo duration | | ● |
| F5.2 | Reorder, duplicate, replace and delete clips | | ● |
| F5.3 | Transitions between clips: fade, dissolve, slide, zoom, wipe, blur, spin | Our own designs | ● |
| F5.4 | Undo and redo for every edit | | ● |
| F5.5 | Markers on the timeline | | ● |

## F6 · Text layers and stickers
| # | Task | Notes | |
|---|---|---|---|
| F6.1 | Free text layers (titles), separate from subtitles, placed anywhere | Reuses the subtitle renderer | ● |
| F6.2 | Text templates (our own designs) | | ● |
| F6.3 | Stickers: emoji, shapes, her own images/PNGs, lower thirds, countdowns, progress bar | No sticker store ○ | ● |
| F6.4 | Draw on the video | | ● |
| F6.5 | Text-to-speech voice-over | Needs an on-device voice model; Tamil voices are limited ◐ | ◐ |

## F7 · Filters, colour and effects
| # | Task | Notes | |
|---|---|---|---|
| F7.1 | Adjust: brightness, contrast, saturation, warmth, tint, fade, sharpen, vignette | WebGL | ● |
| F7.2 | Filters: our own presets (warm, cool, cinematic, B&W, vintage …) | | ● |
| F7.3 | Advanced colour: HSL, curves, colour wheels | | ● |
| F7.4 | Video effects: blur, glitch, VHS, film grain, shake, zoom pulse, light leaks | Our own designs | ● |
| F7.5 | Auto adjust (balance lighting and colour) | Simple statistics, not AI | ◐ |

## F8 · Overlays and green screen
| # | Task | Notes | |
|---|---|---|---|
| F8.1 | Picture-in-picture: a second video or image on top, moved and resized | | ● |
| F8.2 | Opacity and blend modes (multiply, screen, overlay …) | | ● |
| F8.3 | Masks: line, mirror, circle, rectangle, heart, star; feather | | ● |
| F8.4 | Green screen (chroma key) | | ● |
| F8.5 | Split screen layouts | | ● |

## F9 · Keyframes and animation
| # | Task | Notes | |
|---|---|---|---|
| F9.1 | Keyframes for position, size, rotation, opacity and volume | | ● |
| F9.2 | Easing curves | | ● |
| F9.3 | Clip in/out/combo animations (zoom, slide, rotate, bounce) | | ● |

## F10 · Workflow, templates and export
| # | Task | Notes | |
|---|---|---|---|
| F10.1 | Export settings: resolution (480p to 4K), frame rate (24/25/30/50/60), quality | Limited by the device's encoder ◐ | ◐ |
| F10.2 | Save a frame as a picture; choose a cover image | | ● |
| F10.3 | Project templates: save a project's look and structure, reuse it with new media | Our own templates only; no template store ○ | ● |
| F10.4 | Keyboard shortcuts on computers | | ● |
| F10.5 | Duplicate a project; back up and restore projects as a file | | ● |
| F10.6 | Share to apps through the phone's share sheet | Direct posting to social networks needs their accounts and servers ○ | ◐ |

## F11 · Smart tools on the device
| # | Task | Notes | |
|---|---|---|---|
| F11.1 | Remove silences and filler words (from the speech recogniser's word times) | | ● |
| F11.2 | Edit the video by editing its transcript | | ● |
| F11.3 | Beat detection: markers on the music's beats, cut to the beat | | ● |
| F11.4 | Noise reduction and loudness normalisation | Classic signal processing; small models ◐ | ◐ |
| F11.5 | Background removal for people (no green screen) | Small open on-device model; speed depends on the phone ◐ | ◐ |
| F11.6 | Auto reframe (keep the face in frame when changing aspect ratio) | Open face-detection model ◐ | ◐ |
| F11.7 | Scene detection / auto cut | | ● |
| F11.8 | Caption translation | Needs a large on-device model; slow on phones ◐ | ◐ |
| F11.9 | Stabilisation | Heavy; computers first ◐ | ◐ |
| F11.10 | Vocal isolation, enhance voice | Needs large models ◐ | ◐ |

## F12 · Not planned (need servers, licensed content or very large models) ○
- Generating videos, images, avatars or "digital people" from text prompts.
- Face swap, body and face retouching models, relighting, upscaling with AI.
- Script writing and "script to video" with a cloud language model.
- Stock video, music, sound-effect, sticker and template stores.
- Cloud storage, team spaces, accounts, subscriptions.
- Direct posting to social networks, and copyright checks against music catalogues.
- Lip-synced dubbing into other voices.
