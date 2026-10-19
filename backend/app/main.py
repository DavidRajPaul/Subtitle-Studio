"""FastAPI application factory for Subtitle Studio."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app import __version__
from app.audio import AudioStore, extract_audio
from app.config import Settings
from app.diagnostics import ToolStatus, check_tool
from app.jobs import JobCancelled, JobContext, JobError, JobManager
from app.media import MediaError, MediaStore
from app.models import ProjectDoc, TimingSettingsIn, ValidateIn
from app.projects import ProjectError, ProjectStore
from app.speech import (
    DEFAULT_MODEL,
    LANGUAGE_CODES,
    LANGUAGES,
    MODELS,
    Downloader,
    FasterWhisperTranscriber,
    ModelError,
    ModelStore,
    Transcriber,
    huggingface_download,
    segments_to_cues,
    speech_engine_status,
)
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


class TranscribeIn(BaseModel):
    media_id: str
    audio_id: str | None = None
    language: str | None = None  # None or "auto" = detect
    model: str = DEFAULT_MODEL
    max_duration_ms: int = Field(default=7000, ge=1000, le=600_000)
    max_chars: int = Field(default=84, ge=20, le=200)


def _clean_temp(root: Path) -> None:
    """Removes leftovers of interrupted jobs: only UUID-named folders the app created."""
    if not root.is_dir():
        return
    for child in root.iterdir():
        try:
            uuid.UUID(child.name)
        except ValueError:
            continue
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)


def _tool_payload(status: ToolStatus) -> dict[str, Any]:
    return {
        "available": status.available,
        "version": status.version,
        "detail": status.detail,
    }


def create_app(
    settings: Settings | None = None,
    transcriber: Transcriber | None = None,
    downloader: Downloader | None = None,
) -> FastAPI:
    cfg = settings or Settings.from_env()
    app = FastAPI(title="Subtitle Studio API", version=__version__)
    store = MediaStore(cfg.data_dir / "media", cfg.ffprobe_bin)
    audio_store = AudioStore(cfg.data_dir / "media", cfg.ffprobe_bin)
    projects = ProjectStore(cfg.data_dir / "projects")
    models = ModelStore(cfg.data_dir / "models", downloader or huggingface_download)
    engine: Transcriber = transcriber or FasterWhisperTranscriber()
    jobs = JobManager()
    downloads: dict[str, str] = {}  # model name -> job id
    temp_root = cfg.data_dir / "tmp"
    _clean_temp(temp_root)
    app.router.on_shutdown.append(jobs.shutdown)

    def not_found(message: str) -> HTTPException:
        return HTTPException(status_code=404, detail={"code": "not_found", "message": message})

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        tools = {
            "ffmpeg": check_tool("ffmpeg", cfg.ffmpeg_bin),
            "ffprobe": check_tool("ffprobe", cfg.ffprobe_bin),
        }
        all_ok = all(t.available for t in tools.values())
        speech_ok, speech_version, speech_detail = speech_engine_status()
        return {
            "status": "ok" if all_ok else "degraded",
            "version": __version__,
            "tools": {name: _tool_payload(status) for name, status in tools.items()},
            "speech": {
                "available": speech_ok,
                "version": speech_version,
                "detail": speech_detail,
            },
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

    # ---- Separate MP3 ---------------------------------------------------------------------

    @app.post("/api/audio")
    def import_audio(file: UploadFile) -> dict[str, Any]:
        try:
            imported = audio_store.import_file(file.filename or "", file.file)
        except MediaError as err:
            raise HTTPException(
                status_code=422, detail={"code": err.code, "message": err.message}
            ) from err
        return imported.to_dict()

    @app.delete("/api/audio/{audio_id}", status_code=204)
    def remove_audio(audio_id: str) -> Response:
        if not audio_store.remove(audio_id):
            raise not_found("That audio file is no longer imported.")
        return Response(status_code=204)

    # ---- Jobs -----------------------------------------------------------------------------

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, Any]:
        snapshot = jobs.snapshot(job_id)
        if snapshot is None:
            raise not_found(
                "This task is no longer known, probably because the backend restarted. "
                "Start it again."
            )
        return snapshot

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel_job(job_id: str) -> dict[str, Any]:
        jobs.cancel(job_id)
        snapshot = jobs.snapshot(job_id)
        if snapshot is None:
            raise not_found("This task is no longer known.")
        return snapshot

    # ---- Speech models --------------------------------------------------------------------

    def active_download(name: str) -> str | None:
        job_id = downloads.get(name)
        job = jobs.get(job_id) if job_id else None
        return job.id if job and job.status in ("queued", "running") else None

    @app.get("/api/speech/models")
    def list_models() -> dict[str, Any]:
        ok, version, detail = speech_engine_status()
        listing = models.describe()
        for item in listing:
            item["download_job_id"] = active_download(item["name"])
        return {
            "engine": {"available": ok, "version": version, "detail": detail},
            "cache_dir": str(models.root),
            "default_model": DEFAULT_MODEL,
            "models": listing,
            "languages": [{"code": c, "name": n} for c, n in LANGUAGES],
        }

    @app.post("/api/speech/models/{name}/download", status_code=202)
    def download_model(name: str) -> dict[str, Any]:
        info = MODELS.get(name)
        if info is None:
            raise not_found("That speech model is not offered.")
        if models.installed_dir(name) is not None:
            raise HTTPException(
                status_code=409,
                detail={"code": "already_installed", "message": "This model is installed."},
            )
        running = active_download(name)
        if running:
            return {"job_id": running}

        def run(ctx: JobContext) -> dict[str, Any]:
            ctx.report(
                None,
                f"Downloading the {info.label} model (about {info.approx_size_mb} MB). "
                "This needs the internet once and can take a few minutes.",
            )
            try:
                models.download(name)
            except ModelError as err:
                raise JobError(err.code, err.message) from err
            if ctx.cancelled:  # downloads cannot be interrupted midway; undo instead
                models.delete(name)
                raise JobCancelled
            return {"name": name}

        job = jobs.submit("model_download", run)
        downloads[name] = job.id
        return {"job_id": job.id}

    @app.delete("/api/speech/models/{name}", status_code=204)
    def delete_model(name: str) -> Response:
        if name not in MODELS:
            raise not_found("That speech model is not offered.")
        if active_download(name):
            raise HTTPException(
                status_code=409,
                detail={"code": "busy", "message": "Wait for the download to finish first."},
            )
        if not models.delete(name):
            raise not_found("That model is not installed.")
        return Response(status_code=204)

    # ---- Transcription --------------------------------------------------------------------

    @app.post("/api/speech/transcribe", status_code=202)
    def transcribe(body: TranscribeIn) -> dict[str, Any]:
        engine_ok, _, engine_detail = speech_engine_status()
        if transcriber is None and not engine_ok:
            raise HTTPException(
                status_code=503,
                detail={"code": "speech_unavailable", "message": engine_detail},
            )
        video = store.existing_path(body.media_id)
        if video is None:
            raise not_found("The video is no longer imported. Choose it again.")
        source = video
        if body.audio_id:
            mp3 = audio_store.existing_path(body.audio_id)
            if mp3 is None:
                raise not_found("The MP3 is no longer imported. Choose it again.")
            source = mp3
        language = None if body.language in (None, "", "auto") else body.language
        if language is not None and language not in LANGUAGE_CODES:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_language", "message": "That language is not offered."},
            )
        if body.model not in MODELS:
            raise not_found("That speech model is not offered.")
        model_dir = models.installed_dir(body.model)
        if model_dir is None:
            label = MODELS[body.model].label
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "model_missing",
                    "message": f"The {label} speech model is not installed yet. Download it "
                    "once (needs the internet), then transcribe.",
                },
            )
        installed_dir = model_dir

        def run(ctx: JobContext) -> dict[str, Any]:
            work = temp_root / str(uuid.uuid4())
            work.mkdir(parents=True, exist_ok=True)
            try:
                ctx.report(None, "Preparing the audio…")
                wav = work / "audio.wav"
                try:
                    extract_audio(cfg.ffmpeg_bin, source, wav, lambda: ctx.cancelled)
                except InterruptedError as exc:
                    raise JobCancelled from exc
                except MediaError as err:
                    raise JobError(err.code, err.message) from err
                ctx.check()
                ctx.report(0.02, "Loading the speech model…")

                def report(p: float | None) -> None:
                    ctx.report(None if p is None else 0.02 + 0.98 * p, "Recognising speech…")

                try:
                    transcript = engine.transcribe(
                        wav, installed_dir, language, report, lambda: ctx.cancelled
                    )
                except InterruptedError as exc:
                    raise JobCancelled from exc
                except (RuntimeError, ValueError, OSError) as exc:
                    raise JobError(
                        "transcribe_failed",
                        "Speech recognition failed. The model files may be damaged: delete the "
                        "model in Settings, download it again and retry.",
                    ) from exc
                cues = segments_to_cues(transcript.segments, body.max_chars, body.max_duration_ms)
                if not cues:
                    raise JobError(
                        "no_speech",
                        "No speech was recognised. Check that the audio contains speech, or "
                        "pick the language instead of auto-detect and try again.",
                    )
                names = dict(LANGUAGES)
                return {
                    "language": transcript.language,
                    "language_name": names.get(transcript.language or "", transcript.language),
                    "language_probability": transcript.language_probability,
                    "audio_duration_ms": transcript.duration_ms,
                    "used_mp3": body.audio_id is not None,
                    "model": body.model,
                    "cues": [
                        {"id": c.id, "text": c.text, "start_ms": c.start_ms, "end_ms": c.end_ms}
                        for c in cues
                    ],
                }
            finally:
                shutil.rmtree(work, ignore_errors=True)

        job = jobs.submit("transcription", run)
        return {"job_id": job.id}

    return app


app = create_app()
