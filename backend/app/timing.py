"""Timing engine: pure, deterministic, integer milliseconds.

Four distinct modes (never interchangeable):
- equal:    every cue has the same duration; cues are contiguous and fill the video.
- readable: duration from text length (characters per second, clamped to min/max), laid out
            one after another with a gap; unused video time stays blank.
- fit:      stretch (or, if necessary, compress) the readable durations to cover the whole
            video, never exceeding the maximum duration; conflicts are reported.
- manual:   explicit start/duration per cue; values are validated, never adjusted.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.subtitles import (
    Cue,
    Issue,
    ReadabilitySettings,
    fmt_time,
    validate_cues,
    visible_chars,
)
from app.text_import import MAX_SEGMENTS

MODES = ("equal", "readable", "fit", "manual")


class TimingError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ManualTiming:
    start_ms: int
    duration_ms: int


@dataclass(frozen=True)
class TimingResult:
    cues: list[Cue]
    issues: list[Issue]
    seeded: bool = False  # manual mode without supplied values starts from readable timing


def _check_settings(s: ReadabilitySettings) -> None:
    if s.chars_per_second <= 0:
        raise TimingError("invalid_settings", "Characters per second must be above zero.")
    if s.min_duration_ms < 1 or s.gap_ms < 0:
        raise TimingError("invalid_settings", "Minimum duration and gap cannot be negative.")
    if s.min_duration_ms > s.max_duration_ms:
        raise TimingError(
            "invalid_settings", "The minimum duration cannot be longer than the maximum."
        )


def readable_ms(text: str, s: ReadabilitySettings) -> int:
    needed = -(-visible_chars(text) * 10_000 // s.cps_tenths)  # integer ceiling
    return min(max(needed, s.min_duration_ms), s.max_duration_ms)


def _sequential(texts: list[str], durations: list[int], gap_ms: int) -> list[Cue]:
    cues: list[Cue] = []
    t = 0
    for text, d in zip(texts, durations, strict=True):
        cues.append(Cue(text, t, t + d))
        t += d + gap_ms
    return cues


def _equal(texts: list[str], duration_ms: int) -> list[Cue]:
    each = duration_ms // len(texts)
    if each < 1:
        raise TimingError(
            "too_many_cues", "There are more subtitles than milliseconds in this video."
        )
    return [Cue(t, i * each, (i + 1) * each) for i, t in enumerate(texts)]


def _allocate(weights: list[int], total: int, cap: int) -> tuple[list[int], int]:
    """Split `total` ms across cues in proportion to `weights`, each at most `cap`.

    Integer-exact (largest remainder, ties by index). Returns (allocation, leftover) where
    leftover > 0 only if every cue reached `cap` before `total` was used up.
    """
    alloc = [0] * len(weights)
    free = list(range(len(weights)))
    remaining = total
    while free:
        wsum = sum(weights[i] for i in free)
        over = {i for i in free if remaining * weights[i] > cap * wsum}
        if not over:
            break
        for i in over:
            alloc[i] = cap
            remaining -= cap
        free = [i for i in free if i not in over]
    if not free:
        return alloc, remaining
    wsum = sum(weights[i] for i in free)
    shares = [remaining * weights[i] // wsum for i in free]
    rems = [remaining * weights[i] % wsum for i in free]
    extra = remaining - sum(shares)
    for k in sorted(range(len(free)), key=lambda k: (-rems[k], k))[:extra]:
        shares[k] += 1
    for k, i in enumerate(free):
        alloc[i] = shares[k]
    return alloc, 0


def generate_timing(
    texts: list[str],
    mode: str,
    video_duration_ms: int,
    settings: ReadabilitySettings | None = None,
    manual: list[ManualTiming] | None = None,
) -> TimingResult:
    s = settings or ReadabilitySettings()
    _check_settings(s)
    if mode not in MODES:
        raise TimingError("invalid_mode", "Choose a timing mode.")
    if not texts:
        raise TimingError("no_text", "There are no subtitles to time.")
    if len(texts) > MAX_SEGMENTS:
        raise TimingError("too_many_cues", f"The limit is {MAX_SEGMENTS} subtitles.")
    if video_duration_ms <= 0:
        raise TimingError("no_duration", "The video length is unknown.")

    n = len(texts)
    extra: list[Issue] = []
    seeded = False

    if mode == "equal":
        cues = _equal(texts, video_duration_ms)
    elif mode == "manual":
        if manual is None:
            seeded = True
            cues = _sequential(texts, [readable_ms(t, s) for t in texts], s.gap_ms)
        else:
            if len(manual) != n:
                raise TimingError(
                    "manual_mismatch",
                    f"There are {n} subtitles but {len(manual)} timings were supplied.",
                )
            cues = [
                Cue(t, m.start_ms, m.start_ms + m.duration_ms)
                for t, m in zip(texts, manual, strict=True)
            ]
    else:
        ideal = [readable_ms(t, s) for t in texts]
        if mode == "readable":
            cues = _sequential(texts, ideal, s.gap_ms)
            if cues[-1].end_ms > video_duration_ms:
                extra.append(
                    Issue(
                        "readable_exceeds_video",
                        f"Comfortable reading needs {fmt_time(cues[-1].end_ms)}, but the "
                        f"video is {fmt_time(video_duration_ms)} long. Choose Fit to video "
                        "(shows subtitles faster) or raise the characters-per-second setting.",
                    )
                )
        else:
            available = video_duration_ms - s.gap_ms * (n - 1)
            if available < n:
                raise TimingError(
                    "too_many_cues",
                    "This video is too short for that many subtitles with the current gap.",
                )
            alloc, leftover = _allocate(ideal, available, s.max_duration_ms)
            if min(alloc) < 1:
                raise TimingError(
                    "too_many_cues", "This video is too short for that many subtitles."
                )
            cues = _sequential(texts, alloc, s.gap_ms)
            if sum(ideal) + s.gap_ms * (n - 1) > video_duration_ms:
                extra.append(
                    Issue(
                        "compressed",
                        "To cover the video, these subtitles are shown faster than the "
                        "comfortable reading speed. Shorten the text or use Readable duration.",
                    )
                )
            if leftover > 0:
                extra.append(
                    Issue(
                        "cannot_fill",
                        f"Subtitles reach the maximum length ({s.max_duration_ms / 1000:g} s) "
                        f"before filling the video, so {fmt_time(leftover)} stays blank at "
                        "the end. Raise the maximum duration to fill it.",
                    )
                )

    issues = validate_cues(cues, video_duration_ms, s)
    return TimingResult(cues=cues, issues=extra + issues, seeded=seeded)
