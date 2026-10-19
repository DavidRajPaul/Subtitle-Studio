from __future__ import annotations

import pytest

from app.text_import import (
    MAX_SEGMENTS,
    TextImportError,
    decode_text,
    segment_text,
    split_sentences,
)


def test_decode_strips_bom_and_normalizes_line_endings() -> None:
    raw = b"\xef\xbb\xbfOne\r\nTwo\rThree"
    assert decode_text(raw) == "One\nTwo\nThree"


def test_decode_preserves_unicode_exactly() -> None:
    text = "வணக்கம் உலகம்\n日本語のテスト 🎬"
    assert decode_text(text.encode("utf-8")) == text


def test_decode_rejects_non_utf8_with_resave_instructions() -> None:
    with pytest.raises(TextImportError) as info:
        decode_text("café".encode("latin-1"))
    assert info.value.code == "not_utf8"
    assert "UTF-8" in info.value.message


def test_decode_rejects_utf16_and_binary() -> None:
    with pytest.raises(TextImportError) as utf16:
        decode_text("hi".encode("utf-16"))
    assert utf16.value.code == "not_utf8"
    with pytest.raises(TextImportError) as binary:
        decode_text(b"abc\x00def")
    assert binary.value.code == "not_text"


def test_line_mode_one_cue_per_non_empty_line() -> None:
    text = "  First line \n\n\nSecond line\n   \nThird"
    assert segment_text(text, "line") == ["First line", "Second line", "Third"]


def test_paragraph_mode_keeps_internal_line_breaks() -> None:
    text = "Line one\nLine two\n\nNext paragraph\n\n\n\nLast"
    assert segment_text(text, "paragraph") == ["Line one\nLine two", "Next paragraph", "Last"]


def test_sentence_mode_joins_wrapped_lines_and_splits_sentences() -> None:
    text = "Hello there. How are\nyou today? Fine!\n\nNew paragraph without a period"
    assert segment_text(text, "sentence") == [
        "Hello there.",
        "How are you today?",
        "Fine!",
        "New paragraph without a period",
    ]


def test_sentence_mode_does_not_split_abbreviations_decimals_or_initials() -> None:
    assert split_sentences("Dr. Smith paid 3.5 dollars. J. K. Rowling agreed.") == [
        "Dr. Smith paid 3.5 dollars.",
        "J. K. Rowling agreed.",
    ]


def test_sentence_mode_handles_quotes_ellipsis_and_cjk() -> None:
    assert split_sentences('He said "Go." Then left... Really? Yes!') == [
        'He said "Go."',
        "Then left...",
        "Really?",
        "Yes!",
    ]
    assert split_sentences("今日は晴れです。明日は雨です。") == [
        "今日は晴れです。",
        "明日は雨です。",
    ]


def test_sentence_mode_tamil() -> None:
    text = "வணக்கம் நண்பர்களே. இன்று நாம் வரலாறு பார்ப்போம்! தயாரா?"
    assert segment_text(text, "sentence") == [
        "வணக்கம் நண்பர்களே.",
        "இன்று நாம் வரலாறு பார்ப்போம்!",
        "தயாரா?",
    ]


def test_empty_and_whitespace_only_text_is_an_actionable_error() -> None:
    for text in ("", "  \n \n\t"):
        with pytest.raises(TextImportError) as info:
            segment_text(text, "line")
        assert info.value.code == "empty_text"


def test_too_many_segments_is_rejected() -> None:
    text = "\n".join(f"line {i}" for i in range(MAX_SEGMENTS + 1))
    with pytest.raises(TextImportError) as info:
        segment_text(text, "line")
    assert info.value.code == "too_many_segments"


def test_unknown_segmentation_is_rejected() -> None:
    with pytest.raises(TextImportError) as info:
        segment_text("x", "word")
    assert info.value.code == "invalid_segmentation"
