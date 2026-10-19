"""FastAPI application factory for Subtitle Studio."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app import __version__
from app.config import Settings
from app.diagnostics import ToolStatus, check_tool
from app.media import MediaError, MediaStore
from app.models import ProjectDoc, TimingSettingsIn, ValidateIn
from app.projects import ProjectError, ProjectStore
from app.subtitles import Cue, ReadabilitySettings, validate_cues
from app.text_import import (
    MAX_SEGMENTS,
    MAX_TXT_BYTES,
    TextImportError,
    decode_text,
    segment_text,
)
from app.timing import ManualTiming, TimingError, generate_timing


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
    projects = ProjectStore(cfg.data_dir / "projects")

    def not_found(message: str) -> HTTPException:
        return HTTPException(status_code=404, detail={"code": "not_found", "message": message})

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

    @app.get("/api/media/{media_id}/file")
    def media_file(media_id: str) -> FileResponse:
        path = store.existing_path(media_id)
        if path is None:
            raise not_found("The video file for this project is missing.")
        return FileResponse(path, media_type="video/mp4")

    @app.delete("/api/media/{media_id}", status_code=204)
    def remove_media(media_id: str) -> Response:
        if media_id.lower() in projects.referenced_media_ids():
            return Response(status_code=204)  # a saved project still uses this copy
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

    def project_payload(doc: ProjectDoc) -> dict[str, Any]:
        payload = doc.model_dump()
        payload["media_available"] = store.existing_path(doc.media.id) is not None
        return payload

    @app.get("/api/projects")
    def list_projects() -> dict[str, Any]:
        return {
            "projects": [
                {
                    "id": d.id,
                    "name": d.name,
                    "workflow": d.workflow,
                    "updated_at": d.updated_at,
                    "media_filename": d.media.filename,
                    "media_available": store.existing_path(d.media.id) is not None,
                    "cue_count": len(d.cues),
                }
                for d in projects.list()
            ]
        }

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str) -> dict[str, Any]:
        try:
            doc = projects.load(project_id)
        except ProjectError as err:
            raise HTTPException(
                status_code=422, detail={"code": err.code, "message": err.message}
            ) from err
        if doc is None:
            raise not_found("That project could not be found.")
        return project_payload(doc)

    @app.put("/api/projects/{project_id}")
    def save_project(project_id: str, body: ProjectDoc) -> dict[str, Any]:
        if body.id.lower() != project_id.lower():
            raise HTTPException(
                status_code=422,
                detail={"code": "id_mismatch", "message": "The project id does not match."},
            )
        try:
            saved = projects.save(body)
        except ProjectError as err:
            raise HTTPException(
                status_code=500, detail={"code": err.code, "message": err.message}
            ) from err
        return {"id": saved.id, "updated_at": saved.updated_at}

    @app.delete("/api/projects/{project_id}", status_code=204)
    def delete_project(project_id: str) -> Response:
        doc = None
        try:
            doc = projects.load(project_id)
        except ProjectError:
            pass
        if not projects.delete(project_id):
            raise not_found("That project could not be found.")
        # Remove the working copy of the video only if no other project still uses it.
        if doc is not None and doc.media.id.lower() not in projects.referenced_media_ids():
            store.remove(doc.media.id)
        return Response(status_code=204)

    @app.post("/api/timing/validate")
    def timing_validate(body: ValidateIn) -> dict[str, Any]:
        settings = ReadabilitySettings(**body.settings.model_dump())
        cues = [Cue(c.text, c.start_ms, c.end_ms, c.id) for c in body.cues]
        issues = validate_cues(cues, body.duration_ms, settings)
        return {
            "issues": [
                {"code": x.code, "message": x.message, "cue_number": x.cue_number} for x in issues
            ]
        }

    return app


app = create_app()
