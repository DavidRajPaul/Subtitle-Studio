"""FastAPI application factory for Subtitle Studio."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Response, UploadFile

from app import __version__
from app.config import Settings
from app.diagnostics import ToolStatus, check_tool
from app.media import MediaError, MediaStore


def _tool_payload(status: ToolStatus) -> dict[str, Any]:
    return {
        "available": status.available,
        "version": status.version,
        "detail": status.detail,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.from_env()
    app = FastAPI(title="Subtitle Studio API", version=__version__)
    store = MediaStore(cfg.data_dir / "media", cfg.ffprobe_bin)

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

    @app.post("/api/media")
    def import_media(file: UploadFile) -> dict[str, Any]:
        try:
            imported = store.import_file(file.filename or "", file.file)
        except MediaError as err:
            raise HTTPException(
                status_code=422, detail={"code": err.code, "message": err.message}
            ) from err
        return imported.to_dict()

    @app.delete("/api/media/{media_id}", status_code=204)
    def remove_media(media_id: str) -> Response:
        if not store.remove(media_id):
            raise HTTPException(
                status_code=404,
                detail={"code": "not_found", "message": "That video is no longer imported."},
            )
        return Response(status_code=204)

    return app


app = create_app()
