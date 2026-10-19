"""Local speech recognition with faster-whisper.

Audio never leaves the computer. The only network access is the one-time model download,
which the user starts explicitly. faster-whisper is imported lazily so the rest of the app
works (and its tests run) when it is not installed.
"""

from __future__ import annotations

import shutil
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.subtitles import Cue

SENTENCE_END = (".", "!", "?", "…", "。", "！", "？", "।", "॥")


@dataclass(frozen=True)
class ModelInfo:
    name: str
    label: str
    approx_size_mb: int
    description: str


# Multilingual Whisper models converted for faster-whisper (Systran/faster-whisper-<name> on
# Hugging Face, MIT licence; original weights by OpenAI, MIT licence). Sizes are approximate.
MODEL_CATALOG: tuple[ModelInfo, ...] = (
    ModelInfo("tiny", "Tiny", 75, "Fastest, least accurate. Good for a quick try."),
    ModelInfo("base", "Base", 145, "Fast with fair accuracy for clear English speech."),
    ModelInfo(
        "small",
        "Small",
        485,
        "Slower, clearly more accurate. Recommended for Tamil and other non-English speech.",
    ),
    ModelInfo("medium", "Medium", 1530, "Most accurate here, but slow on a typical laptop."),
)
MODELS = {m.name: m for m in MODEL_CATALOG}
DEFAULT_MODEL = "base"

# Shown in the language picker; "auto" lets Whisper detect it.
LANGUAGES: tuple[tuple[str, str], ...] = (
    ("en", "English"),
    ("ta", "Tamil"),
    ("hi", "Hindi"),
    ("te", "Telugu"),
    ("ml", "Malayalam"),
    ("kn", "Kannada"),
    ("bn", "Bengali"),
    ("mr", "Marathi"),
    ("gu", "Gujarati"),
    ("pa", "Punjabi"),
    ("ur", "Urdu"),
    ("ar", "Arabic"),
    ("zh", "Chinese"),
    ("fr", "French"),
    ("de", "German"),
    ("id", "Indonesian"),
    ("it", "Italian"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("pt", "Portuguese"),
    ("ru", "Russian"),
    ("es", "Spanish"),
    ("tr", "Turkish"),
    ("vi", "Vietnamese"),
)
LANGUAGE_CODES = {code for code, _ in LANGUAGES}


@dataclass(frozen=True)
class WordTiming:
    start_ms: int
    end_ms: int
    text: str  # as produced by Whisper, usually with a leading space


@dataclass(frozen=True)
class SpeechSegment:
    start_ms: int
    end_ms: int
    text: str
    words: tuple[WordTiming, ...] = ()


@dataclass(frozen=True)
class Transcript:
    language: str | None
    language_probability: float | None
    duration_ms: int
    segments: list[SpeechSegment]


def _ms(seconds: float | None) -> int:
    return round((seconds or 0.0) * 1000)


def _join(words: list[WordTiming]) -> str:
    # Whisper words carry their own spacing, so this is right for languages with and
    # without spaces between words.
    return "".join(w.text for w in words).strip()


def _flush(chunk: list[WordTiming], cues: list[Cue]) -> None:
    joined = _join(chunk)
    if joined:
        cues.append(Cue(joined, chunk[0].start_ms, chunk[-1].end_ms))
    chunk.clear()


def segments_to_cues(
    segments: list[SpeechSegment], max_chars: int = 84, max_ms: int = 7000
) -> list[Cue]:
    """Turns recognised segments into subtitle cues, splitting long ones at word boundaries.

    Timing comes from the recogniser and is kept as is: nothing is stretched, shortened or
    de-overlapped here. The editor's validation reports anything hard to read.
    """
    cues: list[Cue] = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        fits = len(text) <= max_chars and seg.end_ms - seg.start_ms <= max_ms
        if fits or not seg.words:
            cues.append(Cue(text, seg.start_ms, seg.end_ms))
            continue
        chunk: list[WordTiming] = []
        for word in seg.words:
            if chunk and (
                len(_join([*chunk, word])) > max_chars or word.end_ms - chunk[0].start_ms > max_ms
            ):
                _flush(chunk, cues)
            chunk.append(word)
            joined = _join(chunk)
            if joined.endswith(SENTENCE_END) and len(joined) >= max_chars // 2:
                _flush(chunk, cues)
        _flush(chunk, cues)
    return cues


class Transcriber(Protocol):
    def transcribe(
        self,
        audio: Path,
        model_dir: Path,
        language: str | None,
        report: Callable[[float | None], None],
        cancelled: Callable[[], bool],
    ) -> Transcript: ...


def speech_engine_status() -> tuple[bool, str | None, str | None]:
    """(available, version, detail) for the faster-whisper package."""
    try:
        import faster_whisper
    except ImportError:
        return (
            False,
            None,
            "faster-whisper is not installed. Run 'uv sync' in the backend folder.",
        )
    return True, str(getattr(faster_whisper, "__version__", "")) or None, None


class FasterWhisperTranscriber:
    """Runs on the CPU with int8 weights: slower than a GPU, but works on any computer."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded: tuple[str, Any] | None = None

    def _model(self, model_dir: Path) -> Any:
        from faster_whisper import WhisperModel

        key = str(model_dir)
        with self._lock:
            if self._loaded is None or self._loaded[0] != key:
                self._loaded = (key, WhisperModel(key, device="cpu", compute_type="int8"))
            return self._loaded[1]

    def transcribe(
        self,
        audio: Path,
        model_dir: Path,
        language: str | None,
        report: Callable[[float | None], None],
        cancelled: Callable[[], bool],
    ) -> Transcript:
        model = self._model(model_dir)
        segments, info = model.transcribe(
            str(audio), language=language, word_timestamps=True, vad_filter=True, beam_size=5
        )
        total = float(info.duration or 0.0)
        out: list[SpeechSegment] = []
        for seg in segments:  # a generator: recognition happens while iterating
            if cancelled():
                raise InterruptedError
            words = tuple(WordTiming(_ms(w.start), _ms(w.end), w.word) for w in seg.words or [])
            out.append(SpeechSegment(_ms(seg.start), _ms(seg.end), seg.text, words))
            report(min(1.0, seg.end / total) if total > 0 else None)
        return Transcript(
            language=info.language,
            language_probability=info.language_probability,
            duration_ms=_ms(total),
            segments=out,
        )


Downloader = Callable[[str, Path], None]


def huggingface_download(name: str, dest: Path) -> None:
    from faster_whisper import download_model

    download_model(name, output_dir=str(dest))


class ModelError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ModelStore:
    """Speech models in an app-owned folder: <root>/<name>/model.bin and friends."""

    def __init__(self, root: Path, downloader: Downloader = huggingface_download) -> None:
        self.root = root
        self.downloader = downloader

    def _dir(self, name: str) -> Path:
        if name not in MODELS:
            raise ModelError("unknown_model", "That speech model is not offered.")
        return self.root / name

    def installed_dir(self, name: str) -> Path | None:
        path = self._dir(name)
        return path if (path / "model.bin").is_file() else None

    def size_on_disk(self, name: str) -> int:
        path = self._dir(name)
        if not path.is_dir():
            return 0
        return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())

    def describe(self) -> list[dict[str, Any]]:
        return [
            {
                "name": m.name,
                "label": m.label,
                "approx_size_mb": m.approx_size_mb,
                "description": m.description,
                "installed": self.installed_dir(m.name) is not None,
                "size_on_disk_bytes": self.size_on_disk(m.name),
            }
            for m in MODEL_CATALOG
        ]

    def download(self, name: str) -> Path:
        final = self._dir(name)
        partial = self.root / f".{name}.partial"
        self.root.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(partial, ignore_errors=True)
        try:
            self.downloader(name, partial)
        except Exception as exc:
            shutil.rmtree(partial, ignore_errors=True)
            raise ModelError(
                "download_failed",
                "The model could not be downloaded. Check the internet connection and try "
                "again (models come from Hugging Face).",
            ) from exc
        if not (partial / "model.bin").is_file():
            shutil.rmtree(partial, ignore_errors=True)
            raise ModelError("download_incomplete", "The download was incomplete. Try again.")
        shutil.rmtree(final, ignore_errors=True)
        partial.replace(final)
        return final

    def discard_partial(self, name: str) -> None:
        if name in MODELS:
            shutil.rmtree(self.root / f".{name}.partial", ignore_errors=True)

    def delete(self, name: str) -> bool:
        path = self._dir(name)
        if not path.exists():
            return False
        shutil.rmtree(path)
        return True
