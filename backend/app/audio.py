"""Separate MP3 import and FFmpeg audio extraction for transcription.

The user's files are never modified: MP3s are copied into the app-owned media folder, and
extracted audio goes to an app-owned temporary folder that is removed afterwards. FFmpeg and
FFprobe are run with argument arrays only.
"""

from __future__ import annotations

import json
import subprocess
import time
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import IO, Any

from app.media import COPY_CHUNK_BYTES, PROBE_TIMEOUT_SECONDS, MediaError

MAX_MP3_BYTES = 500 * 1024 * 1024
EXTRACT_TIMEOUT_SECONDS = 60 * 60
SAMPLE_RATE = 16_000  # what Whisper models expect


@dataclass(frozen=True)
class AudioMetadata:
    duration_ms: int
    codec: str | None
    sample_rate: int | None
    channels: int | None


def parse_audio_probe(raw: str) -> AudioMetadata:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MediaError("probe_failed", "The audio file could not be inspected.") from exc
    fmt: dict[str, Any] = data.get("format") or {}
    streams: list[dict[str, Any]] = data.get("streams") or []
    if "mp3" not in str(fmt.get("format_name", "")).split(","):
        raise MediaError(
            "not_mp3", "This file is not an MP3. Choose an .mp3 file, or convert it to MP3 first."
        )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if audio is None:
        raise MediaError("no_audio_stream", "This MP3 contains no audio. Choose another file.")
    try:
        seconds = float(str(fmt.get("duration") or audio.get("duration")))
    except (TypeError, ValueError):
        seconds = 0.0
    if seconds <= 0:
        raise MediaError(
            "no_duration", "The audio's length could not be read. The file may be damaged."
        )
    rate = str(audio.get("sample_rate") or "")
    return AudioMetadata(
        duration_ms=round(seconds * 1000),
        codec=audio.get("codec_name"),
        sample_rate=int(rate) if rate.isdigit() else None,
        channels=int(audio["channels"]) if isinstance(audio.get("channels"), int) else None,
    )


def probe_audio(ffprobe_bin: str, path: Path) -> AudioMetadata:
    args = [ffprobe_bin, "-v", "error", "-print_format", "json", "-show_format", "-show_streams"]
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argument array, no shell
            [*args, str(path)],
            capture_output=True,
            text=True,
            timeout=PROBE_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError as exc:
        raise MediaError(
            "ffprobe_missing", "FFprobe is not installed. Install FFmpeg, then try again."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("probe_timeout", "Inspecting the audio took too long.") from exc
    if completed.returncode != 0:
        raise MediaError("unreadable", "This file could not be read as audio. It may be damaged.")
    return parse_audio_probe(completed.stdout)


@dataclass(frozen=True)
class ImportedAudio:
    id: str
    filename: str
    size_bytes: int
    metadata: AudioMetadata

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "metadata": asdict(self.metadata),
        }


class AudioStore:
    """Working copies of separate MP3 files, next to the video copies."""

    def __init__(self, root: Path, ffprobe_bin: str) -> None:
        self.root = root
        self.ffprobe_bin = ffprobe_bin

    def _path(self, audio_id: str) -> Path:
        return self.root / f"{uuid.UUID(audio_id)}.mp3"

    def import_file(self, filename: str, source: IO[bytes]) -> ImportedAudio:
        safe_name = Path(filename or "").name
        if not safe_name.lower().endswith(".mp3"):
            raise MediaError("not_mp3", "Choose an audio file ending in .mp3.")
        self.root.mkdir(parents=True, exist_ok=True)
        audio_id = str(uuid.uuid4())
        final = self._path(audio_id)
        partial = final.with_suffix(".part")
        size = 0
        try:
            with partial.open("wb") as out:
                while chunk := source.read(COPY_CHUNK_BYTES):
                    size += len(chunk)
                    if size > MAX_MP3_BYTES:
                        raise MediaError(
                            "too_large", "This MP3 is larger than 500 MB. Choose a shorter file."
                        )
                    out.write(chunk)
            if size == 0:
                raise MediaError("empty_file", "This file is empty. Choose a different MP3.")
            metadata = probe_audio(self.ffprobe_bin, partial)
            partial.replace(final)
        except BaseException:
            partial.unlink(missing_ok=True)
            raise
        return ImportedAudio(id=audio_id, filename=safe_name, size_bytes=size, metadata=metadata)

    def existing_path(self, audio_id: str) -> Path | None:
        try:
            path = self._path(audio_id)
        except ValueError:
            return None
        return path if path.exists() else None

    def remove(self, audio_id: str) -> bool:
        path = self.existing_path(audio_id)
        if path is None:
            return False
        path.unlink()
        return True


def extraction_args(ffmpeg_bin: str, source: Path, dest: Path) -> list[str]:
    """16 kHz mono 16-bit WAV from the first audio stream; never writes to the source."""
    return [
        ffmpeg_bin,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        str(dest),
    ]


def extract_audio(
    ffmpeg_bin: str,
    source: Path,
    dest: Path,
    cancelled: Callable[[], bool] = lambda: False,
    timeout_s: float = EXTRACT_TIMEOUT_SECONDS,
) -> None:
    """Runs FFmpeg; raises MediaError with a next step on failure, or InterruptedError on cancel."""
    if dest.resolve() == source.resolve():
        raise MediaError("bad_destination", "Refusing to overwrite the source file.")
    try:
        proc = subprocess.Popen(  # noqa: S603 - fixed argument array, no shell
            extraction_args(ffmpeg_bin, source, dest),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as exc:
        raise MediaError(
            "ffmpeg_missing", "FFmpeg is not installed, so the audio cannot be read."
        ) from exc
    deadline = time.monotonic() + timeout_s
    while proc.poll() is None:
        if cancelled() or time.monotonic() > deadline:
            proc.kill()
            proc.wait()
            dest.unlink(missing_ok=True)
            if cancelled():
                raise InterruptedError
            raise MediaError("extract_timeout", "Reading the audio took too long.")
        time.sleep(0.05)
    stderr = proc.stderr.read() if proc.stderr else ""
    if proc.returncode != 0:
        dest.unlink(missing_ok=True)
        if "matches no streams" in stderr or "does not contain any stream" in stderr:
            raise MediaError(
                "no_audio",
                "This video has no audio track. Add a separate MP3, or create subtitles from a "
                "text file instead.",
            )
        raise MediaError("extract_failed", "The audio could not be read from this file.")
    if not dest.exists() or dest.stat().st_size <= 44:  # 44 bytes = empty WAV header
        dest.unlink(missing_ok=True)
        raise MediaError("no_audio", "No audio could be read from this file.")
