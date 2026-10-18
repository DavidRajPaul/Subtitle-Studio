# Subtitle Studio — Low-Fidelity Wireframes

These are structural wireframes, not final visual assets. Implement the hierarchy and behavior first; refine visual styling after the first working prototype.

## 1. Home / project selection

```text
┌──────────────────────────────────────┐
│ Subtitle Studio             Settings │
│ Local processing                     │
├──────────────────────────────────────┤
│ Create a subtitle project            │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🎙  Transcribe speech            │ │
│ │ MP4 audio or a separate MP3      │ │
│ │                         [Start]  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ▤  Create from text              │ │
│ │ MP4 + TXT, including silent video│ │
│ │                         [Start]  │ │
│ └──────────────────────────────────┘ │
│ Recent projects                      │
│ • Travel clip              [Open]    │
└──────────────────────────────────────┘
```

## 2. Import

```text
┌──────────────────────────────────────┐
│ ← New project              Step 1/3  │
│ Add your video                       │
│ ┌──────────────────────────────────┐ │
│ │ Select MP4                       │ │
│ └──────────────────────────────────┘ │
│ clip.mp4 · 00:00:12 · 1080×1920      │
│ Audio track detected                 │
│                                      │
│ [Speech workflow]                    │
│ Optional: [Select MP3]               │
│                                      │
│ [Continue]                           │
└──────────────────────────────────────┘
```

## 3. Timing mode

```text
┌──────────────────────────────────────┐
│ How should subtitles be timed?       │
│                                      │
│ ○ Equal distribution                 │
│   Every cue gets the same duration   │
│ ○ Readable duration                  │
│   Longer text stays longer           │
│ ○ Fit to video                       │
│   Try to cover the whole clip        │
│ ○ Manual                             │
│   Set each start and duration        │
│                                      │
│ Preview: “Hi everyone.”              │
│ 12-second video · estimated result   │
│                                      │
│ [Generate subtitles]                 │
└──────────────────────────────────────┘
```

## 4. Editor — phone layout

```text
┌──────────────────────────────────────┐
│ ← My Project       Saved       Export│
├──────────────────────────────────────┤
│                                      │
│           VIDEO PREVIEW              │
│       [Subtitle appears here]        │
│                                      │
│  ◀  ▶    00:00:05.200 / 00:00:12     │
│  ━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━  │
├──────────────────────────────────────┤
│ Subtitles                 + Add      │
│ ┌──────────────────────────────────┐ │
│ │ 1  Welcome everyone.             │ │
│ │    00:00:00 – 00:00:02  [Edit]   │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 2  Today we'll learn...          │ │
│ │    00:00:02 – 00:00:05  [Edit]   │ │
│ └──────────────────────────────────┘ │
│ [Timeline strip: cue blocks + playhead]│
│                                      │
│ [Timing]                 [Style]      │
└──────────────────────────────────────┘
```

## 5. Edit subtitle bottom sheet

```text
┌──────────────────────────────────────┐
│ Edit subtitle                    Done│
├──────────────────────────────────────┤
│ Text                                 │
│ ┌──────────────────────────────────┐ │
│ │ Welcome everyone.                │ │
│ └──────────────────────────────────┘ │
│ Start       End        Duration      │
│ [00:00:05] [00:00:07] [00:00:02]      │
│ Placement:  Sequential / Independent │
│ [Apply duration to selected cues ▾]  │
│                                      │
│ [Save changes]                       │
└──────────────────────────────────────┘
```

## 6. Style bottom sheet

```text
┌──────────────────────────────────────┐
│ Subtitle style                   Done│
├──────────────────────────────────────┤
│ Font             [System Sans     ▾] │
│ Size             [ 48 ]              │
│ Text color       [ White  ● ]        │
│ [Bold] [Italic]                      │
│ Outline          [Black ●] [ 2 px ]  │
│ Shadow           [ On ]              │
│ Background       [ Off ▾ ]           │
│ Position         [Top][Middle][Bottom]│
│ Safe margin      [ 5% ]              │
│                                      │
│ Preview updates as you change values │
└──────────────────────────────────────┘
```

## 7. Export result

```text
┌──────────────────────────────────────┐
│ Export subtitles                     │
│                                      │
│ ☑ SRT subtitle file                  │
│ ☑ Burn subtitles into MP4            │
│ Output: MyProject_subtitled.mp4      │
│                                      │
│ Rendering… 63%                       │
│ ━━━━━━━━━━━━━●━━━━━━━━━━━━━━        │
│                                      │
│ [Cancel export]                      │
└──────────────────────────────────────┘
```

## Wireframe implementation notes
- These layouts show hierarchy only; use the design tokens and accessibility rules in UI_DESIGN_SYSTEM.md.
- Desktop layout can use a preview + inspector, but phone must remain single-column.
- Ensure no key action depends only on drag-and-drop; provide file pickers and numeric timing.
- The displayed timing in wireframes is illustrative, not a required default.
