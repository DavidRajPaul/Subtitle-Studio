from __future__ import annotations

import pytest

from app.subtitles import Cue, ReadabilitySettings, validate_cues
from app.timing import ManualTiming, TimingError, generate_timing

S = ReadabilitySettings()  # 17 cps, 1000-7000 ms, 100 ms gap


def spans(result_cues: list[Cue]) -> list[tuple[int, int]]:
    return [(c.start_ms, c.end_ms) for c in result_cues]


def codes(result_issues: list) -> list[str]:  # type: ignore[type-arg]
    return [i.code for i in result_issues]


# ---- Equal distribution --------------------------------------------------------------------


def test_equal_gives_every_cue_the_same_duration_and_is_contiguous() -> None:
    r = generate_timing(["a", "b", "c"], "equal", 12_000, S)
    assert spans(r.cues) == [(0, 4000), (4000, 8000), (8000, 12000)]


def test_equal_one_short_line_fills_the_whole_video() -> None:
    r = generate_timing(["Hi everyone."], "equal", 12_000, S)
    assert spans(r.cues) == [(0, 12000)]
    assert "too_long" in codes(r.issues)  # reported, not silently changed


def test_equal_uses_floor_so_durations_are_identical() -> None:
    r = generate_timing(["a", "b", "c"], "equal", 10_000, S)
    assert {c.duration_ms for c in r.cues} == {3333}
    assert r.cues[-1].end_ms == 9999  # at most n-1 ms left over at the end


# ---- Readable duration ---------------------------------------------------------------------


def test_readable_durations_follow_text_length_with_gaps() -> None:
    ten = "x" * 10  # ceil(10 / 17 s) = 589 ms -> raised to the 1000 ms minimum
    fifty = "y" * 51  # exactly 3000 ms
    r = generate_timing([ten, fifty], "readable", 60_000, S)
    assert spans(r.cues) == [(0, 1000), (1100, 4100)]


def test_readable_may_leave_the_rest_of_the_video_blank() -> None:
    r = generate_timing(["Hi everyone."], "readable", 12_000, S)
    assert spans(r.cues) == [(0, 1000)]
    assert r.issues == []


def test_readable_clamps_to_maximum_and_flags_hard_to_read_text() -> None:
    long_text = "z" * 300  # would need ~17.6 s; clamped to 7 s
    r = generate_timing([long_text], "readable", 60_000, S)
    assert spans(r.cues) == [(0, 7000)]
    assert codes(r.issues) == ["too_fast"]


def test_readable_that_runs_past_the_video_is_reported_not_trimmed() -> None:
    texts = ["w" * 85] * 3  # 5000 ms each + gaps = 15200 ms
    r = generate_timing(texts, "readable", 10_000, S)
    assert r.cues[-1].end_ms == 15_200
    found = codes(r.issues)
    assert "readable_exceeds_video" in found
    assert found.count("out_of_range") == 2


# ---- Fit to video --------------------------------------------------------------------------


def test_fit_stretches_proportionally_and_covers_the_video_exactly() -> None:
    r = generate_timing(["a" * 17, "b" * 34], "fit", 9_100, S)
    # ideal 1000 and 2000 ms; available = 9100 - 100 gap = 9000 -> 3000 / 6000
    assert spans(r.cues) == [(0, 3000), (3100, 9100)]
    assert r.issues == []


def test_fit_never_exceeds_max_duration_and_says_so() -> None:
    r = generate_timing(["Hi everyone."], "fit", 12_000, S)
    assert spans(r.cues) == [(0, 7000)]
    assert codes(r.issues) == ["cannot_fill"]
    assert "00:00:05.000" in r.issues[0].message


def test_fit_redistributes_the_excess_from_capped_cues() -> None:
    texts = ["a" * 17, "b" * 17, "c" * 170]
    r = generate_timing(texts, "fit", 20_000, S)
    d = [c.duration_ms for c in r.cues]
    assert max(d) <= 7000
    assert r.cues[-1].end_ms == 20_000
    assert d[0] == d[1]


def test_fit_compresses_when_text_is_too_long_and_warns() -> None:
    texts = ["q" * 85] * 4  # 5000 ms each ideal = 20300 ms with gaps
    r = generate_timing(texts, "fit", 10_000, S)
    assert r.cues[-1].end_ms == 10_000
    found = codes(r.issues)
    assert "compressed" in found
    assert "too_fast" in found


def test_fit_is_integer_exact_for_awkward_sizes() -> None:
    texts = [f"{'t' * (5 + i)}" for i in range(7)]
    r = generate_timing(texts, "fit", 23_457, S)
    assert r.cues[-1].end_ms == 23_457
    assert all(isinstance(c.start_ms, int) and isinstance(c.end_ms, int) for c in r.cues)


# ---- Manual --------------------------------------------------------------------------------


def test_manual_uses_exactly_the_supplied_values() -> None:
    manual = [ManualTiming(5000, 2000), ManualTiming(0, 1500)]
    r = generate_timing(["a", "b"], "manual", 12_000, S, manual)
    assert spans(r.cues) == [(5000, 7000), (0, 1500)]
    assert not r.seeded
    assert r.issues == [i for i in r.issues if i.code != "overlap"]


def test_manual_without_values_is_seeded_from_readable_timing() -> None:
    r = generate_timing(["Hi everyone."], "manual", 12_000, S)
    assert r.seeded
    assert spans(r.cues) == [(0, 1000)]


def test_manual_reports_overlap_range_and_bad_intervals_without_fixing_them() -> None:
    manual = [
        ManualTiming(0, 3000),
        ManualTiming(2000, 3000),  # overlaps cue 1
        ManualTiming(11_000, 3000),  # runs past a 12 s video
        ManualTiming(-500, 1000),  # starts before 0
        ManualTiming(4000, 0),  # zero length
    ]
    r = generate_timing(list("abcde"), "manual", 12_000, S, manual)
    assert spans(r.cues)[1] == (2000, 5000)  # untouched
    found = {(i.code, i.cue_number) for i in r.issues}
    assert ("overlap", 2) in found
    assert ("out_of_range", 3) in found
    assert ("invalid_interval", 4) in found
    assert ("invalid_interval", 5) in found


def test_manual_length_mismatch_is_an_error() -> None:
    with pytest.raises(TimingError) as info:
        generate_timing(["a", "b"], "manual", 12_000, S, [ManualTiming(0, 1000)])
    assert info.value.code == "manual_mismatch"


# ---- Validation and determinism ------------------------------------------------------------


def test_overlap_check_handles_unordered_cues_and_long_covering_cue() -> None:
    cues = [Cue("a", 5000, 6000), Cue("b", 0, 10_000), Cue("c", 7000, 8000)]
    issues = validate_cues(cues, 20_000, S)
    overlaps = {i.cue_number for i in issues if i.code == "overlap"}
    assert overlaps == {1, 3}  # both start inside cue 2 (0-10 s)


def test_touching_cues_do_not_overlap() -> None:
    cues = [Cue("a", 0, 1000), Cue("b", 1000, 2000)]
    assert [i for i in validate_cues(cues, 5000, S) if i.code == "overlap"] == []


@pytest.mark.parametrize("mode", ["equal", "readable", "fit", "manual"])
def test_generation_is_deterministic(mode: str) -> None:
    texts = ["வணக்கம்", "Hello world, this is a test.", "x" * 80, "ok"]
    a = generate_timing(texts, mode, 30_000, S)
    b = generate_timing(texts, mode, 30_000, S)
    assert spans(a.cues) == spans(b.cues)
    assert [i.message for i in a.issues] == [i.message for i in b.issues]


def test_unicode_text_is_preserved_in_cues() -> None:
    r = generate_timing(["வணக்கம்\nஉலகம்", "日本語 🎬"], "readable", 30_000, S)
    assert [c.text for c in r.cues] == ["வணக்கம்\nஉலகம்", "日本語 🎬"]


def test_invalid_inputs_raise_actionable_errors() -> None:
    with pytest.raises(TimingError) as no_text:
        generate_timing([], "equal", 1000, S)
    assert no_text.value.code == "no_text"
    with pytest.raises(TimingError) as no_duration:
        generate_timing(["a"], "equal", 0, S)
    assert no_duration.value.code == "no_duration"
    with pytest.raises(TimingError) as bad:
        generate_timing(["a"], "readable", 1000, ReadabilitySettings(min_duration_ms=9000))
    assert bad.value.code == "invalid_settings"
    with pytest.raises(TimingError) as tiny:
        generate_timing(["a"] * 50, "equal", 10, S)
    assert tiny.value.code == "too_many_cues"
    with pytest.raises(TimingError) as gap:
        generate_timing(["a"] * 50, "fit", 3000, ReadabilitySettings(gap_ms=100))
    assert gap.value.code == "too_many_cues"
