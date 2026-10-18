"""External tool diagnostics (FFmpeg / FFprobe).

Tools are invoked with argument arrays only; no shell is used.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass

VERSION_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class ToolStatus:
    name: str
    available: bool
    version: str | None
    detail: str | None


def check_tool(name: str, binary: str) -> ToolStatus:
    """Report whether `binary` runs and what version line it prints."""
    resolved = shutil.which(binary)
    if resolved is None:
        return ToolStatus(
            name=name,
            available=False,
            version=None,
            detail=f"'{binary}' was not found on PATH. Install FFmpeg or set its path.",
        )
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argument array, no shell
            [resolved, "-version"],
            capture_output=True,
            text=True,
            timeout=VERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return ToolStatus(
            name=name,
            available=False,
            version=None,
            detail=f"'{binary}' could not be started: {type(exc).__name__}.",
        )
    if completed.returncode != 0:
        return ToolStatus(
            name=name,
            available=False,
            version=None,
            detail=f"'{binary}' exited with code {completed.returncode}.",
        )
    first_line = completed.stdout.splitlines()[0] if completed.stdout else ""
    return ToolStatus(name=name, available=True, version=first_line or None, detail=None)
