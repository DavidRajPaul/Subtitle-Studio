"""Canonical subtitle model and interval validation.

All times are integer milliseconds. Validation only *reports* problems; it never moves,
trims or deletes cues.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Cue:
    text: str
    start_ms: int
    end_ms: int
    id: str = field(default_factory=lambda: uuid.uuid4().hex)

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


@dataclass(frozen=True)
class Issue:
    """A warning about timing. `cue_number` is 1-based; None means it applies to the whole set."""

    code: str
    message: str
    cue_number: int | None = None


@dataclass(frozen=True)
class ReadabilitySettings:
    chars_per_second: float = 17.0
    min_duration_ms: int = 1000
    max_duration_ms: int = 7000
    gap_ms: int = 100

    @property
    def cps_tenths(self) -> int:
        return max(1, round(self.chars_per_second * 10))


def visible_chars(text: str) -> int:
    """Characters counted for reading speed: line breaks excluded, never zero."""
    return max(1, len(text.replace("\n", "")))


def fmt_time(ms: int) -> str:
    sign = "-" if ms < 0 else ""
    total = abs(ms)
    return (
        f"{sign}{total // 3_600_000:02d}:{total % 3_600_000 // 60_000:02d}:"
        f"{total % 60_000 // 1000:02d}.{total % 1000:03d}"
    )


def _secs(ms: int) -> str:
    return f"{ms / 1000:.1f} s"


def validate_cues(
    cues: list[Cue], video_duration_ms: int, settings: ReadabilitySettings
) -> list[Issue]:
    issues: list[Issue] = []
    valid: list[int] = []
    for i, cue in enumerate(cues):
        n = i + 1
        if cue.start_ms < 0:
            issues.append(
                Issue("invalid_interval", f"Subtitle {n} starts before the video begins.", n)
            )
            continue
        if cue.end_ms <= cue.start_ms:
            issues.append(
                Issue("invalid_interval", f"Subtitle {n} ends at or before its start time.", n)
            )
            continue
        valid.append(i)
        if cue.end_ms > video_duration_ms:
            issues.append(
                Issue(
                    "out_of_range",
                    f"Subtitle {n} ends at {fmt_time(cue.end_ms)}, after the end of the "
                    f"video ({fmt_time(video_duration_ms)}).",
                    n,
                )
            )
        duration = cue.duration_ms
        chars = visible_chars(cue.text)
        if chars * 10_000 > settings.cps_tenths * duration:
            issues.append(
                Issue(
                    "too_fast",
                    f"Subtitle {n} may be hard to read: about {chars * 1000 / duration:.0f} "
                    f"characters per second (comfortable limit {settings.chars_per_second:g}).",
                    n,
                )
            )
        if duration < settings.min_duration_ms:
            issues.append(
                Issue(
                    "too_short",
                    f"Subtitle {n} is shown for {_secs(duration)}, shorter than the "
                    f"{_secs(settings.min_duration_ms)} minimum.",
                    n,
                )
            )
        elif duration > settings.max_duration_ms:
            issues.append(
                Issue(
                    "too_long",
                    f"Subtitle {n} is shown for {_secs(duration)}, longer than the "
                    f"{_secs(settings.max_duration_ms)} maximum.",
                    n,
                )
            )
    # Overlaps: walk valid cues in start order, tracking the latest end seen so far.
    latest: int | None = None
    for i in sorted(valid, key=lambda k: (cues[k].start_ms, k)):
        if latest is not None and cues[i].start_ms < cues[latest].end_ms:
            issues.append(
                Issue(
                    "overlap",
                    f"Subtitle {i + 1} starts at {fmt_time(cues[i].start_ms)}, before "
                    f"subtitle {latest + 1} ends at {fmt_time(cues[latest].end_ms)}.",
                    i + 1,
                )
            )
        if latest is None or cues[i].end_ms > cues[latest].end_ms:
            latest = i
    issues.sort(key=lambda x: (x.cue_number or 0, x.code))
    return issues
