"""Media import and FFprobe inspection.

Imported files are copied into an app-owned directory; the user's original is never
modified. FFprobe is invoked with an argument array only (no shell).
"""

from __future__ import annotations

import json
import subprocess
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import IO, Any

PROBE_TIMEOUT_SECONDS = 30
COPY_CHUNK_BYTES = 1024 * 1024
MP4_FORMAT_NAMES = {"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}


class MediaError(Exception):
    """A user-facing media problem with a stable code and an actionable message."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class MediaMetadata:
    duration_ms: int
    width: int
    height: int
    frame_rate: float | None
    video_codec: str | None
    has_audio: bool
    audio_codec: str | None
    container: str


def _parse_rate(value: object) -> float | None:
    if not isinstance(value, str) or "/" not in value:
        return None
    num_s, den_s = value.split("/", 1)
    try:
        num, den = float(num_s), float(den_s)
    except ValueError:
        return None
    if den == 0 or num == 0:
        return None
    return round(num / den, 3)


def _duration_ms(fmt: dict[str, Any], video: dict[str, Any]) -> int:
    for raw in (fmt.get("duration"), video.get("duration")):
        try:
            seconds = float(str(raw))
        except (TypeError, ValueError):
            continue
        if seconds > 0:
            return round(seconds * 1000)
    return 0


def parse_probe_output(raw: str) -> MediaMetadata:
    """Turn ffprobe JSON into metadata, raising MediaError for unusable input."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MediaError("probe_failed", "The video could not be inspected.") from exc
    fmt: dict[str, Any] = data.get("format") or {}
    streams: list[dict[str, Any]] = data.get("streams") or []
    format_names = set(str(fmt.get("format_name", "")).split(","))
    if not format_names & MP4_FORMAT_NAMES:
        raise MediaError(
            "not_mp4",
            "This file is not an MP4 video. Choose an .mp4 file, or convert it to MP4 first.",
        )
    video = next(
        (
            s
            for s in streams
            if s.get("codec_type") == "video"
            and not (s.get("disposition") or {}).get("attached_pic")
        ),
        None,
    )
    if video is None:
        raise MediaError(
            "no_video_stream",
            "This MP4 has no video track (it may be audio only). Choose a file with video.",
        )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = _duration_ms(fmt, video)
    if duration <= 0:
        raise MediaError(
            "no_duration",
            "The video's length could not be read. The file may be incomplete or damaged.",
        )
    return MediaMetadata(
        duration_ms=duration,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        frame_rate=_parse_rate(video.get("avg_frame_rate"))
        or _parse_rate(video.get("r_frame_rate")),
        video_codec=video.get("codec_name"),
        has_audio=audio is not None,
        audio_codec=audio.get("codec_name") if audio else None,
        container="mp4",
    )


def probe(ffprobe_bin: str, path: Path) -> MediaMetadata:
    args = [
        ffprobe_bin,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argument array, no shell
            args, capture_output=True, text=True, timeout=PROBE_TIMEOUT_SECONDS, check=False
        )
    except FileNotFoundError as exc:
        raise MediaError(
            "ffprobe_missing",
            "FFprobe is not installed, so the video cannot be inspected. "
            "Install FFmpeg, then try again.",
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("probe_timeout", "Inspecting the video took too long.") from exc
    if completed.returncode != 0:
        raise MediaError(
            "unreadable",
            "This file could not be read as a video. It may be damaged or not really an MP4.",
        )
    return parse_probe_output(completed.stdout)


@dataclass(frozen=True)
class ImportedMedia:
    id: str
    filename: str
    size_bytes: int
    metadata: MediaMetadata

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "metadata": asdict(self.metadata),
        }


class MediaStore:
    """Holds imported working copies under an app-owned directory."""

    def __init__(self, root: Path, ffprobe_bin: str) -> None:
        self.root = root
        self.ffprobe_bin = ffprobe_bin

    def _path(self, media_id: str) -> Path:
        uuid.UUID(media_id)  # rejects anything that is not a plain UUID (no path tricks)
        return self.root / f"{media_id}.mp4"

    def import_file(self, filename: str, source: IO[bytes]) -> ImportedMedia:
        safe_name = Path(filename or "").name
        if not safe_name.lower().endswith(".mp4"):
            raise MediaError("not_mp4", "Choose a video file ending in .mp4.")
        self.root.mkdir(parents=True, exist_ok=True)
        media_id = str(uuid.uuid4())
        final = self._path(media_id)
        partial = final.with_suffix(".part")
        size = 0
        try:
            with partial.open("wb") as out:
                while chunk := source.read(COPY_CHUNK_BYTES):
                    out.write(chunk)
                    size += len(chunk)
            if size == 0:
                raise MediaError("empty_file", "This file is empty. Choose a different video.")
            metadata = probe(self.ffprobe_bin, partial)
            partial.replace(final)
        except BaseException:
            partial.unlink(missing_ok=True)
            raise
        return ImportedMedia(id=media_id, filename=safe_name, size_bytes=size, metadata=metadata)

    def existing_path(self, media_id: str) -> Path | None:
        try:
            path = self._path(media_id)
        except ValueError:
            return None
        return path if path.exists() else None

    def remove(self, media_id: str) -> bool:
        try:
            path = self._path(media_id)
        except ValueError:
            return False
        if path.exists():
            path.unlink()
            return True
        return False
