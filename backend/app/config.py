"""Runtime configuration, read from environment variables.

Defaults are safe for local use: the server binds to 127.0.0.1 only.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    ffmpeg_bin: str
    ffprobe_bin: str

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            host=os.environ.get("SUBTITLE_STUDIO_HOST", "127.0.0.1"),
            port=int(os.environ.get("SUBTITLE_STUDIO_PORT", "8000")),
            ffmpeg_bin=os.environ.get("SUBTITLE_STUDIO_FFMPEG", "ffmpeg"),
            ffprobe_bin=os.environ.get("SUBTITLE_STUDIO_FFPROBE", "ffprobe"),
        )
