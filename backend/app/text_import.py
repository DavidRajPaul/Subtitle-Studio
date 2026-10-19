"""TXT decoding and segmentation (line, paragraph, sentence).

Unicode is preserved as-is (no normalization). Line endings are normalized to "\\n".
"""

from __future__ import annotations

MAX_TXT_BYTES = 2 * 1024 * 1024
MAX_SEGMENTS = 5000
SEGMENTATIONS = ("line", "paragraph", "sentence")

_TERMINATORS = ".!?…。！？।॥"
_CJK_TERMINATORS = "。！？"
_CLOSERS = "\"'”’)]»」』"
_ABBREVIATIONS = {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "e.g", "i.e"}


class TextImportError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def decode_text(raw: bytes) -> str:
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        raise TextImportError(
            "not_utf8",
            "This text file is saved as UTF-16. Open it in a text editor and save it again "
            "as UTF-8 (in Notepad: File > Save As > Encoding: UTF-8).",
        )
    if b"\x00" in raw:
        raise TextImportError(
            "not_text", "This does not look like a plain text file. Choose a .txt script."
        )
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise TextImportError(
            "not_utf8",
            "This text file is not saved as UTF-8, so some characters could not be read. "
            "Open it in a text editor and save it again as UTF-8 "
            "(in Notepad: File > Save As > Encoding: UTF-8).",
        ) from exc
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _paragraphs(text: str) -> list[list[str]]:
    """Groups of consecutive non-blank lines (each line stripped)."""
    groups: list[list[str]] = []
    current: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped:
            current.append(stripped)
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def _is_abbreviation(before: str) -> bool:
    words = before.split()
    if not words:
        return False
    word = words[-1].lstrip("\"'“‘([").lower()
    if word in _ABBREVIATIONS:
        return True
    return len(word) == 1 and word.isascii() and word.isalpha() and words[-1][-1:].isupper()


def split_sentences(text: str) -> list[str]:
    out: list[str] = []
    start = 0
    i = 0
    n = len(text)
    while i < n:
        if text[i] not in _TERMINATORS:
            i += 1
            continue
        j = i + 1
        while j < n and (text[j] in _TERMINATORS or text[j] in _CLOSERS):
            j += 1
        run = text[i:j]
        boundary = j >= n or text[j].isspace() or any(c in _CJK_TERMINATORS for c in run)
        if boundary and run == "." and _is_abbreviation(text[start:i]):
            boundary = False
        if boundary:
            sentence = text[start:j].strip()
            if sentence:
                out.append(sentence)
            start = j
        i = j
    tail = text[start:].strip()
    if tail:
        out.append(tail)
    return out


def segment_text(text: str, mode: str) -> list[str]:
    if mode not in SEGMENTATIONS:
        raise TextImportError("invalid_segmentation", "Choose line, paragraph or sentence.")
    groups = _paragraphs(text)
    if mode == "line":
        segments = [line for group in groups for line in group]
    elif mode == "paragraph":
        segments = ["\n".join(group) for group in groups]
    else:
        # Hard-wrapped lines inside a paragraph are joined with spaces before splitting.
        segments = [s for group in groups for s in split_sentences(" ".join(group))]
    if not segments:
        raise TextImportError(
            "empty_text", "No text was found in this file. Add some text and try again."
        )
    if len(segments) > MAX_SEGMENTS:
        raise TextImportError(
            "too_many_segments",
            f"This script has {len(segments)} subtitles; the limit is {MAX_SEGMENTS}. "
            "Split it into smaller files.",
        )
    return segments
