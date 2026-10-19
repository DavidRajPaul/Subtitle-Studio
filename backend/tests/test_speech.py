from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.audio import extract_audio, extraction_args, parse_audio_probe
from app.config import Settings
from app.jobs import JobCancelled, JobContext, JobError, JobManager
from app.main import create_app
from app.media import MediaError
from app.speech import (
    FasterWhisperTranscriber,
    SpeechSegment,
    Transcript,
    WordTiming,
    segments_to_cues,
)

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg/FFprobe not installed",
)


# ---- segments_to_cues (pure) ---------------------------------------------------------------


def words(*items: tuple[int, int, str]) -> tuple[WordTiming, ...]:
    return tuple(WordTiming(a, b, t) for a, b, t in items)


def test_short_segments_become_one_cue_each_with_exact_timing() -> None:
    segs = [
        SpeechSegment(0, 1500, " வணக்கம் நண்பர்களே."),
        SpeechSegment(1600, 3000, " Hello there"),
        SpeechSegment(3000, 3100, "   "),  # blank text is dropped
    ]
    cues = segments_to_cues(segs)
    assert [(c.text, c.start_ms, c.end_ms) for c in cues] == [
        ("வணக்கம் நண்பர்களே.", 0, 1500),
        ("Hello there", 1600, 3000),
    ]
    assert len({c.id for c in cues}) == 2


def test_long_segment_is_split_at_word_boundaries_by_length() -> None:
    w = words(*[(i * 500, i * 500 + 400, f" word{i:02d}") for i in range(12)])
    seg = SpeechSegment(0, 6000, "".join(x.text for x in w), w)
    cues = segments_to_cues([seg], max_chars=30, max_ms=60_000)
    assert all(len(c.text) <= 30 for c in cues)
    assert " ".join(c.text for c in cues) == seg.text.strip()
    assert cues[0].start_ms == 0 and cues[-1].end_ms == 5900
    for prev, nxt in zip(cues, cues[1:], strict=False):
        assert prev.end_ms <= nxt.start_ms  # word times are used as is


def test_long_segment_is_split_by_duration() -> None:
    w = words((0, 3000, " one"), (3000, 6000, " two"), (6000, 9000, " three"))
    cues = segments_to_cues([SpeechSegment(0, 9000, " one two three", w)], max_ms=7000)
    assert [(c.text, c.start_ms, c.end_ms) for c in cues] == [
        ("one two", 0, 6000),
        ("three", 6000, 9000),
    ]


def test_splits_after_a_sentence_end_once_reasonably_long() -> None:
    w = words(
        (0, 400, " This"),
        (400, 800, " is"),
        (800, 1200, " the"),
        (1200, 1600, " first."),
        (1700, 2000, " Second"),
        (2000, 2400, " one."),
    )
    seg = SpeechSegment(0, 2400, " This is the first. Second one.", w)
    cues = segments_to_cues([seg], max_chars=25, max_ms=60_000)
    assert [c.text for c in cues] == ["This is the first.", "Second one."]


def test_long_segment_without_words_is_kept_for_the_editor_to_flag() -> None:
    cues = segments_to_cues([SpeechSegment(0, 20_000, " " + "x" * 200)], max_chars=84)
    assert len(cues) == 1 and cues[0].end_ms == 20_000


def test_languages_without_spaces_are_joined_correctly() -> None:
    w = words((0, 300, "日本"), (300, 600, "語"), (600, 900, "です。"))
    cues = segments_to_cues([SpeechSegment(0, 9000, "日本語です。", w)], max_ms=500)
    assert "".join(c.text for c in cues) == "日本語です。"


# ---- Jobs ----------------------------------------------------------------------------------


def wait_for(manager: JobManager, job_id: str, timeout: float = 10) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        snap = manager.snapshot(job_id)
        assert snap is not None
        if snap["status"] not in ("queued", "running"):
            return snap
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def test_job_success_failure_and_unexpected_error() -> None:
    manager = JobManager()

    def ok(ctx: JobContext) -> dict[str, Any]:
        ctx.report(0.5, "Half")
        return {"answer": 42}

    def bad(ctx: JobContext) -> dict[str, Any]:
        raise JobError("nope", "A clear reason.")

    def crash(ctx: JobContext) -> dict[str, Any]:
        raise KeyError("internal detail")

    a, b, c = (manager.submit("t", f) for f in (ok, bad, crash))
    assert wait_for(manager, a.id)["result"] == {"answer": 42}
    snap_b = wait_for(manager, b.id)
    assert snap_b["status"] == "failed"
    assert snap_b["error"] == {"code": "nope", "message": "A clear reason."}
    snap_c = wait_for(manager, c.id)
    assert snap_c["error"]["code"] == "unexpected"
    assert "internal detail" not in snap_c["error"]["message"]
    manager.shutdown()


def test_cancel_running_and_queued_jobs() -> None:
    manager = JobManager()
    started = threading.Event()

    def slow(ctx: JobContext) -> dict[str, Any]:
        started.set()
        for _ in range(500):
            ctx.check()
            time.sleep(0.01)
        return {}

    running = manager.submit("t", slow)
    queued = manager.submit("t", slow)
    assert started.wait(5)
    assert manager.cancel(queued.id)
    assert manager.cancel(running.id)
    assert wait_for(manager, running.id)["status"] == "cancelled"
    assert wait_for(manager, queued.id)["status"] == "cancelled"
    assert manager.cancel(running.id) is False  # already finished
    manager.shutdown()


def test_a_cancel_during_the_last_step_wins() -> None:
    manager = JobManager()
    holder: dict[str, str] = {}
    ready = threading.Event()

    def fn(ctx: JobContext) -> dict[str, Any]:
        assert ready.wait(5)
        manager.cancel(holder["id"])
        return {"too": "late"}

    holder["id"] = manager.submit("t", fn).id
    ready.set()
    snap = wait_for(manager, holder["id"])
    assert snap["status"] == "cancelled" and snap["result"] is None
    manager.shutdown()


def test_job_cancelled_exception_is_cancel() -> None:
    manager = JobManager()

    def fn(ctx: JobContext) -> dict[str, Any]:
        raise JobCancelled

    assert wait_for(manager, manager.submit("t", fn).id)["status"] == "cancelled"
    manager.shutdown()


# ---- Audio ---------------------------------------------------------------------------------


def test_audio_probe_errors() -> None:
    with pytest.raises(MediaError) as info:
        parse_audio_probe(json.dumps({"format": {"format_name": "wav"}, "streams": []}))
    assert info.value.code == "not_mp3"
    with pytest.raises(MediaError) as info:
        parse_audio_probe(json.dumps({"format": {"format_name": "mp3"}, "streams": []}))
    assert info.value.code == "no_audio_stream"
    meta = parse_audio_probe(
        json.dumps(
            {
                "format": {"format_name": "mp3", "duration": "2.5"},
                "streams": [{"codec_type": "audio", "codec_name": "mp3", "sample_rate": "44100"}],
            }
        )
    )
    assert meta.duration_ms == 2500 and meta.sample_rate == 44100


def test_extraction_uses_an_argument_array_and_a_separate_output() -> None:
    args = extraction_args("ffmpeg", Path("/in/my clip; rm -rf.mp4"), Path("/tmp/x/audio.wav"))
    assert args[args.index("-i") + 1] == "/in/my clip; rm -rf.mp4"  # one argument, no shell
    assert args[-1] == "/tmp/x/audio.wav"
    assert "-ar" in args and args[args.index("-ar") + 1] == "16000"


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)  # noqa: S603


def make_video(path: Path, audio: bool) -> Path:
    inputs = ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=25"]
    if audio:
        inputs += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    ffmpeg(*inputs, "-t", "2", "-pix_fmt", "yuv420p", "-shortest", str(path))
    return path


def make_mp3(path: Path, seconds: str = "3") -> Path:
    ffmpeg(
        "-f", "lavfi", "-i", "sine=frequency=300", "-t", seconds, "-c:a", "libmp3lame", str(path)
    )
    return path


@needs_ffmpeg
def test_extract_audio_makes_16k_mono_wav_and_leaves_source_untouched(tmp_path: Path) -> None:
    src = make_video(tmp_path / "v.mp4", audio=True)
    before = src.read_bytes()
    dest = tmp_path / "out.wav"
    extract_audio("ffmpeg", src, dest)
    probe = subprocess.run(  # noqa: S603
        ["ffprobe", "-v", "error", "-show_streams", "-print_format", "json", str(dest)],
        capture_output=True,
        text=True,
        check=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["sample_rate"] == "16000" and stream["channels"] == 1
    assert src.read_bytes() == before


@needs_ffmpeg
def test_extract_audio_explains_a_silent_video(tmp_path: Path) -> None:
    src = make_video(tmp_path / "silent.mp4", audio=False)
    with pytest.raises(MediaError) as info:
        extract_audio("ffmpeg", src, tmp_path / "out.wav")
    assert info.value.code == "no_audio"
    assert "MP3" in info.value.message
    assert not (tmp_path / "out.wav").exists()


def test_extract_audio_refuses_to_overwrite_the_source(tmp_path: Path) -> None:
    src = tmp_path / "a.wav"
    src.write_bytes(b"x")
    with pytest.raises(MediaError):
        extract_audio("ffmpeg", src, src)
    assert src.read_bytes() == b"x"


# ---- API with a fake recogniser ------------------------------------------------------------


class FakeTranscriber:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, Path, str | None]] = []
        self.segments = [
            SpeechSegment(0, 1200, " வணக்கம்"),
            SpeechSegment(1300, 2500, " Hello world."),
        ]
        self.delay = 0.0
        self.error: Exception | None = None

    def transcribe(
        self,
        audio: Path,
        model_dir: Path,
        language: str | None,
        report: Callable[[float | None], None],
        cancelled: Callable[[], bool],
    ) -> Transcript:
        assert audio.exists() and audio.suffix == ".wav"
        self.calls.append((audio, model_dir, language))
        if self.error:
            raise self.error
        for i in range(10):
            if cancelled():
                raise InterruptedError
            time.sleep(self.delay)
            report((i + 1) / 10)
        return Transcript("ta", 0.93, 2500, list(self.segments))


def fake_download(name: str, dest: Path) -> None:
    dest.mkdir(parents=True)
    (dest / "model.bin").write_bytes(b"weights")
    (dest / "config.json").write_text("{}")


@pytest.fixture
def env(tmp_path: Path) -> tuple[TestClient, FakeTranscriber, Path]:
    data = tmp_path / "data"
    settings = Settings("127.0.0.1", 8000, "ffmpeg", "ffprobe", data_dir=data)
    fake = FakeTranscriber()
    client = TestClient(create_app(settings, transcriber=fake, downloader=fake_download))
    return client, fake, data


def wait_job(client: TestClient, job_id: str, timeout: float = 15) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        snap: dict[str, Any] = client.get(f"/api/jobs/{job_id}").json()
        if snap["status"] not in ("queued", "running"):
            return snap
        time.sleep(0.03)
    raise AssertionError("job did not finish")


def install(client: TestClient, name: str = "base") -> None:
    job = client.post(f"/api/speech/models/{name}/download").json()["job_id"]
    assert wait_job(client, job)["status"] == "succeeded"


def upload_video(client: TestClient, path: Path) -> str:
    with path.open("rb") as fh:
        body = client.post("/api/media", files={"file": ("v.mp4", fh, "video/mp4")}).json()
    return str(body["id"])


def test_models_listing_download_and_delete(env: tuple[TestClient, FakeTranscriber, Path]) -> None:
    client, _, data = env
    listing = client.get("/api/speech/models").json()
    assert [m["name"] for m in listing["models"]] == ["tiny", "base", "small", "medium"]
    assert not any(m["installed"] for m in listing["models"])
    assert {"code": "ta", "name": "Tamil"} in listing["languages"]
    assert listing["cache_dir"] == str(data / "models")
    install(client, "small")
    small = next(
        m for m in client.get("/api/speech/models").json()["models"] if m["name"] == "small"
    )
    assert small["installed"] and small["size_on_disk_bytes"] > 0
    again = client.post("/api/speech/models/small/download")
    assert again.json()["detail"]["code"] == "already_installed"
    assert client.delete("/api/speech/models/small").status_code == 204
    assert not (data / "models" / "small").exists()
    assert client.post("/api/speech/models/../download").status_code == 404
    assert client.delete("/api/speech/models/huge").status_code == 404


def test_failed_download_leaves_nothing_behind(tmp_path: Path) -> None:
    def broken(name: str, dest: Path) -> None:
        dest.mkdir(parents=True)
        (dest / "half").write_text("x")
        raise OSError("network down")

    settings = Settings("127.0.0.1", 8000, "ffmpeg", "ffprobe", data_dir=tmp_path / "d")
    client = TestClient(create_app(settings, transcriber=FakeTranscriber(), downloader=broken))
    job = client.post("/api/speech/models/tiny/download").json()["job_id"]
    snap = wait_job(client, job)
    assert snap["status"] == "failed" and snap["error"]["code"] == "download_failed"
    assert "internet" in snap["error"]["message"]
    assert list((tmp_path / "d" / "models").iterdir()) == []


@needs_ffmpeg
def test_transcribe_requires_an_installed_model(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, _ = env
    media_id = upload_video(client, make_video(tmp_path / "v.mp4", audio=True))
    res = client.post("/api/speech/transcribe", json={"media_id": media_id, "model": "base"})
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "model_missing"
    assert "Download" in res.json()["detail"]["message"]
    assert fake.calls == []


@needs_ffmpeg
def test_transcribe_video_audio_produces_editable_cues_and_cleans_up(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, data = env
    install(client)
    media_id = upload_video(client, make_video(tmp_path / "v.mp4", audio=True))
    res = client.post(
        "/api/speech/transcribe", json={"media_id": media_id, "language": "ta", "model": "base"}
    )
    assert res.status_code == 202
    snap = wait_job(client, res.json()["job_id"])
    assert snap["status"] == "succeeded", snap
    result = snap["result"]
    assert [(c["text"], c["start_ms"], c["end_ms"]) for c in result["cues"]] == [
        ("வணக்கம்", 0, 1200),
        ("Hello world.", 1300, 2500),
    ]
    assert result["language_name"] == "Tamil" and result["used_mp3"] is False
    assert fake.calls[0][2] == "ta"
    assert fake.calls[0][1] == data / "models" / "base"
    assert list((data / "tmp").iterdir()) == []  # extracted audio removed


@needs_ffmpeg
def test_transcribe_uses_the_separate_mp3_when_given(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, _ = env
    install(client)
    media_id = upload_video(client, make_video(tmp_path / "silent.mp4", audio=False))
    with make_mp3(tmp_path / "voice.mp3").open("rb") as fh:
        audio = client.post("/api/audio", files={"file": ("voice.mp3", fh, "audio/mpeg")}).json()
    assert audio["metadata"]["duration_ms"] > 2900
    res = client.post(
        "/api/speech/transcribe",
        json={"media_id": media_id, "audio_id": audio["id"], "language": "auto"},
    )
    snap = wait_job(client, res.json()["job_id"])
    assert snap["status"] == "succeeded" and snap["result"]["used_mp3"] is True
    assert fake.calls[0][2] is None  # auto-detect
    assert client.delete(f"/api/audio/{audio['id']}").status_code == 204


@needs_ffmpeg
def test_silent_video_without_mp3_fails_with_a_next_step(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, _ = env
    install(client)
    media_id = upload_video(client, make_video(tmp_path / "silent.mp4", audio=False))
    res = client.post("/api/speech/transcribe", json={"media_id": media_id})
    snap = wait_job(client, res.json()["job_id"])
    assert snap["status"] == "failed" and snap["error"]["code"] == "no_audio"
    assert fake.calls == []


@needs_ffmpeg
def test_transcription_can_be_cancelled(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, data = env
    install(client)
    fake.delay = 0.2
    media_id = upload_video(client, make_video(tmp_path / "v.mp4", audio=True))
    job_id = client.post("/api/speech/transcribe", json={"media_id": media_id}).json()["job_id"]
    deadline = time.monotonic() + 10
    while not fake.calls and time.monotonic() < deadline:
        time.sleep(0.02)
    progress = client.get(f"/api/jobs/{job_id}").json()
    assert progress["status"] == "running"
    client.post(f"/api/jobs/{job_id}/cancel")
    snap = wait_job(client, job_id)
    assert snap["status"] == "cancelled" and snap["result"] is None
    assert list((data / "tmp").iterdir()) == []


@needs_ffmpeg
def test_no_speech_and_engine_errors_are_explained(
    env: tuple[TestClient, FakeTranscriber, Path], tmp_path: Path
) -> None:
    client, fake, _ = env
    install(client)
    media_id = upload_video(client, make_video(tmp_path / "v.mp4", audio=True))
    fake.segments = []
    snap = wait_job(
        client, client.post("/api/speech/transcribe", json={"media_id": media_id}).json()["job_id"]
    )
    assert snap["error"]["code"] == "no_speech"
    fake.error = RuntimeError("corrupt model")
    snap = wait_job(
        client, client.post("/api/speech/transcribe", json={"media_id": media_id}).json()["job_id"]
    )
    assert snap["error"]["code"] == "transcribe_failed"
    assert "corrupt" not in snap["error"]["message"]


def test_transcribe_validates_inputs(env: tuple[TestClient, FakeTranscriber, Path]) -> None:
    client, _, _ = env
    missing = client.post("/api/speech/transcribe", json={"media_id": str(uuid.uuid4())})
    assert missing.status_code == 404
    assert client.get(f"/api/jobs/{uuid.uuid4()}").status_code == 404


def test_mp3_import_rejects_other_files(env: tuple[TestClient, FakeTranscriber, Path]) -> None:
    client, _, _ = env
    res = client.post("/api/audio", files={"file": ("a.wav", b"RIFF", "audio/wav")})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "not_mp3"


def test_startup_removes_only_app_owned_temp_folders(tmp_path: Path) -> None:
    data = tmp_path / "data"
    stale = data / "tmp" / str(uuid.uuid4())
    stale.mkdir(parents=True)
    (stale / "audio.wav").write_bytes(b"x")
    keep = data / "tmp" / "not-ours"
    keep.mkdir()
    create_app(Settings("127.0.0.1", 8000, "ffmpeg", "ffprobe", data_dir=data))
    assert not stale.exists() and keep.exists()


def test_health_reports_the_speech_engine(env: tuple[TestClient, FakeTranscriber, Path]) -> None:
    client, _, _ = env
    speech = client.get("/api/health").json()["speech"]
    assert set(speech) == {"available", "version", "detail"}


# ---- Real faster-whisper (only when a model folder is provided) ----------------------------

REAL_MODEL = os.environ.get("SUBTITLE_STUDIO_TEST_MODEL_DIR")


@pytest.mark.skipif(not REAL_MODEL, reason="set SUBTITLE_STUDIO_TEST_MODEL_DIR to a model folder")
@needs_ffmpeg
def test_real_faster_whisper_runs_on_extracted_audio(tmp_path: Path) -> None:
    src = make_video(tmp_path / "v.mp4", audio=True)
    wav = tmp_path / "a.wav"
    extract_audio("ffmpeg", src, wav)
    seen: list[float | None] = []
    transcript = FasterWhisperTranscriber().transcribe(
        wav, Path(str(REAL_MODEL)), None, seen.append, lambda: False
    )
    assert transcript.duration_ms > 0
