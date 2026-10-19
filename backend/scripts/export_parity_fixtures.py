"""Exports the Python engine's results so the browser engine can be tested against them.

Run from the backend folder:  uv run python scripts/export_parity_fixtures.py
Writes ../frontend/src/engine/__fixtures__/python-parity.json (deterministic).
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from app.subtitles import Cue, ReadabilitySettings, validate_cues
from app.text_import import TextImportError, decode_text, segment_text
from app.timing import ManualTiming, TimingError, generate_timing

OUT = Path(__file__).resolve().parents[2] / "frontend/src/engine/__fixtures__/python-parity.json"

TEXTS = [
    "Hello world.\nSecond line\n\nNew paragraph here.\n",
    "வணக்கம் நண்பர்களே. இன்று நாம் தமிழ் வரலாற்றைப் பார்ப்போம்! சரியா?\n\nWelcome.",
    "Dr. Smith met Mr. J. Doe at 3.5 p.m. today. Then they left!\n",
    '"Is it?" she asked. (Yes.) He said "no." Done…',
    "日本語です。次の文！最後？\n終わり",
    "नमस्ते। यह परीक्षा है॥ ठीक है",
    "  leading and trailing spaces  \r\n\r\n\r\nwindows\rold mac\n",
    "Emoji 🎬 test. Another 😀 one!",
    "No terminator at all",
    "Line one\nline two wrapped\nstill same paragraph.\n\nNext para.",
    "e.g. this and i.e. that. St. Louis vs. Boston.",
    "Wait... what?! Really?!? Yes.",
    "A.B.C. corp. is here. U.S. news.",
]

RAW_DECODE = [
    ("utf8", "Plain UTF-8 ✓".encode()),
    ("bom", b"\xef\xbb\xbfWith BOM\r\nline"),
    ("utf16", "x".encode("utf-16")),
    ("latin1", "caf\xe9".encode("latin-1")),
    ("nul", b"abc\x00def"),
    ("blank", b"\n\n  \n"),
]


def cue_list(cues: list[Cue]) -> list[list[Any]]:
    return [[c.text, c.start_ms, c.end_ms] for c in cues]


def issues(items: list[Any]) -> list[list[Any]]:
    return [[i.code, i.message, i.cue_number] for i in items]


def main() -> None:
    rng = random.Random(20261019)
    data: dict[str, Any] = {"decode": [], "segment": [], "timing": [], "validate": []}

    for name, raw in RAW_DECODE:
        try:
            text = decode_text(raw)
            data["decode"].append({"name": name, "bytes": list(raw), "ok": True, "text": text})
        except TextImportError as err:
            data["decode"].append({"name": name, "bytes": list(raw), "ok": False, "code": err.code})

    for text in TEXTS:
        for mode in ("line", "paragraph", "sentence"):
            norm = decode_text(text.encode())
            try:
                segs = segment_text(norm, mode)
                data["segment"].append({"text": norm, "mode": mode, "ok": True, "segments": segs})
            except TextImportError as err:
                data["segment"].append({"text": norm, "mode": mode, "ok": False, "code": err.code})

    words = ["a", "the", "subtitle", "வணக்கம்", "நண்பர்களே", "🎬", "longerwordhere", "x", "日本語"]
    settings_pool = [
        ReadabilitySettings(),
        ReadabilitySettings(12.5, 500, 4000, 0),
        ReadabilitySettings(17.25, 1500, 7000, 250),  # .25 -> banker's rounding of tenths
        ReadabilitySettings(25, 800, 3000, 40),
        ReadabilitySettings(17, 1000, 1000, 100),
    ]
    for case in range(160):
        n = rng.randint(1, 12)
        texts = [
            " ".join(rng.choice(words) for _ in range(rng.randint(1, 14)))
            + ("\nsecond line" if rng.random() < 0.2 else "")
            for _ in range(n)
        ]
        s = settings_pool[case % len(settings_pool)]
        duration = rng.choice([1, 7, 999, 5000, 12_345, 20_000, 60_000, 300_001])
        mode = ["equal", "readable", "fit", "manual"][case % 4]
        manual = None
        if mode == "manual" and rng.random() < 0.6:
            manual = [
                ManualTiming(rng.randint(-500, duration + 500), rng.randint(-100, 9000))
                for _ in range(n)
            ]
        entry: dict[str, Any] = {
            "texts": texts,
            "mode": mode,
            "duration_ms": duration,
            "settings": [s.chars_per_second, s.min_duration_ms, s.max_duration_ms, s.gap_ms],
            "manual": [[m.start_ms, m.duration_ms] for m in manual] if manual else None,
        }
        try:
            result = generate_timing(texts, mode, duration, s, manual)
            entry.update(
                ok=True,
                cues=cue_list(result.cues),
                issues=issues(result.issues),
                seeded=result.seeded,
            )
        except TimingError as err:
            entry.update(ok=False, code=err.code)
        data["timing"].append(entry)

    for case in range(80):
        n = rng.randint(1, 8)
        cues = []
        for _ in range(n):
            start = rng.randint(-300, 10_000)
            end = start + rng.choice([-50, 0, 1, 250, 1050, 1250, 1500, 2750, 4000, 9000])
            text = " ".join(rng.choice(words) for _ in range(rng.randint(1, 20)))
            cues.append(Cue(text, start, end))
        s = settings_pool[case % len(settings_pool)]
        duration = rng.choice([3000, 8000, 12_000])
        data["validate"].append(
            {
                "cues": cue_list(cues),
                "duration_ms": duration,
                "settings": [s.chars_per_second, s.min_duration_ms, s.max_duration_ms, s.gap_ms],
                "issues": issues(validate_cues(cues, duration, s)),
            }
        )

    OUT.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    counts = {k: len(v) for k, v in data.items()}
    print(f"wrote {OUT} {counts}")


if __name__ == "__main__":
    main()
