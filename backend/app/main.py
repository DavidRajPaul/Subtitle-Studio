"""FastAPI application factory for Subtitle Studio."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from app import __version__
from app.config import Settings
from app.diagnostics import ToolStatus, check_tool


def _tool_payload(status: ToolStatus) -> dict[str, Any]:
    return {
        "available": status.available,
        "version": status.version,
        "detail": status.detail,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.from_env()
    app = FastAPI(title="Subtitle Studio API", version=__version__)

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        tools = {
            "ffmpeg": check_tool("ffmpeg", cfg.ffmpeg_bin),
            "ffprobe": check_tool("ffprobe", cfg.ffprobe_bin),
        }
        all_ok = all(t.available for t in tools.values())
        return {
            "status": "ok" if all_ok else "degraded",
            "version": __version__,
            "tools": {name: _tool_payload(status) for name, status in tools.items()},
        }

    return app


app = create_app()
