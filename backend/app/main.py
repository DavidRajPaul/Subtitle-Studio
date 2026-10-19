"""FastAPI application factory for Subtitle Studio."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app import __version__
from app.config import Settings
from app.diagnostics import ToolStatus, check_tool
from app.media import MediaError, MediaStore
from app.subtitles import ReadabilitySettings
from app.text_import import (
    MAX_SEGMENTS,
    MAX_TXT_BYTES,
    TextImportError,
    decode_text,
    segment_text,
)
from app.timing import ManualTiming, TimingError, generate_timing


class TimingSettingsIn(BaseModel):
    chars_per_second: float = Field(default=17.0, gt=0, le=60)
    min_duration_ms: int = Field(default=1000, ge=1, le=60_000)
    max_duration_ms: int = Field(default=7000, ge=1, le=600_000)
    gap_ms: int = Field(default=100, ge=0, le=5000)


class ManualTimingIn(BaseModel):
    start_ms: int = Field(ge=-1_000_000_000, le=1_000_000_000)
    duration_ms: int = Field(ge=-1_000_000_000, le=1_000_000_000)


class GenerateIn(BaseModel):
    segments: list[str] = Field(min_length=1, max_length=MAX_SEGMENTS)
    mode: Literal["equal", "readable", "fit", "manual"]
    duration_ms: int = Field(gt=0)
    settings: TimingSettingsIn = Field(default_factory=TimingSettingsIn)
    manual: list[ManualTimingIn] | None = None


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

    @app.post("/api/text/parse")
    def parse_text(
        file: UploadFile, segmentation: Annotated[str, Form()] = "line"
    ) -> dict[str, Any]:
        name = file.filename or ""
        try:
            if not name.lower().endswith(".txt"):
                raise TextImportError("not_txt", "Choose a plain text file ending in .txt.")
            raw = file.file.read(MAX_TXT_BYTES + 1)
            if len(raw) > MAX_TXT_BYTES:
                raise TextImportError(
                    "too_large", "This text file is larger than 2 MB. Split it into smaller files."
                )
            segments = segment_text(decode_text(raw), segmentation)
        except TextImportError as err:
            raise HTTPException(
                status_code=422, detail={"code": err.code, "message": err.message}
            ) from err
        return {
            "filename": name,
            "segmentation": segmentation,
            "count": len(segments),
            "segments": segments,
        }

    @app.post("/api/timing/generate")
    def timing_generate(body: GenerateIn) -> dict[str, Any]:
        settings = ReadabilitySettings(**body.settings.model_dump())
        manual = (
            [ManualTiming(m.start_ms, m.duration_ms) for m in body.manual]
            if body.manual is not None
            else None
        )
        try:
            result = generate_timing(body.segments, body.mode, body.duration_ms, settings, manual)
        except TimingError as err:
            raise HTTPException(
                status_code=422, detail={"code": err.code, "message": err.message}
            ) from err
        cues = result.cues
        last_end = max(c.end_ms for c in cues)
        return {
            "cues": [
                {
                    "id": c.id,
                    "index": i + 1,
                    "text": c.text,
                    "start_ms": c.start_ms,
                    "end_ms": c.end_ms,
                }
                for i, c in enumerate(cues)
            ],
            "issues": [
                {"code": x.code, "message": x.message, "cue_number": x.cue_number}
                for x in result.issues
            ],
            "summary": {
                "cue_count": len(cues),
                "first_start_ms": min(c.start_ms for c in cues),
                "last_end_ms": last_end,
                "blank_end_ms": body.duration_ms - last_end,
                "video_duration_ms": body.duration_ms,
                "seeded": result.seeded,
            },
        }

    return app


app = create_app()
