from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.media import MediaError, parse_probe_output

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg/FFprobe not installed",
)


def _make(path: Path, *inputs: str, extra: tuple[str, ...] = ()) -> Path:
    args = ["ffmpeg", "-v", "error", "-y", *inputs, *extra, "-t", "2", str(path)]
    subprocess.run(args, check=True)  # noqa: S603
    return path


VIDEO = ("-f", "lavfi", "-i", "testsrc=size=320x240:rate=25")
AUDIO = ("-f", "lavfi", "-i", "sine=frequency=440")


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        host="127.0.0.1",
        port=8000,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        data_dir=tmp_path / "data",
    )
    return TestClient(create_app(settings))


def _upload(client: TestClient, path: Path, name: str | None = None) -> object:
    with path.open("rb") as fh:
        return client.post("/api/media", files={"file": (name or path.name, fh, "video/mp4")})


@needs_ffmpeg
def test_import_reports_metadata_and_keeps_source_untouched(
    client: TestClient, tmp_path: Path
) -> None:
    src = _make(tmp_path / "clip.mp4", *VIDEO, *AUDIO, extra=("-pix_fmt", "yuv420p"))
    before = src.read_bytes()
    response = _upload(client, src)
    assert response.status_code == 200, response.text  # type: ignore[attr-defined]
    body = response.json()  # type: ignore[attr-defined]
    meta = body["metadata"]
    assert body["filename"] == "clip.mp4"
    assert body["size_bytes"] == len(before)
    assert meta["width"] == 320 and meta["height"] == 240
    assert meta["frame_rate"] == 25.0
    assert 1900 <= meta["duration_ms"] <= 2100
    assert isinstance(meta["duration_ms"], int)
    assert meta["has_audio"] is True
    assert src.read_bytes() == before
    copy = tmp_path / "data" / "media" / f"{body['id']}.mp4"
    assert copy.exists()
    assert client.delete(f"/api/media/{body['id']}").status_code == 204
    assert not copy.exists()


@needs_ffmpeg
def test_silent_video_reports_no_audio(client: TestClient, tmp_path: Path) -> None:
    src = _make(tmp_path / "silent.mp4", *VIDEO, extra=("-pix_fmt", "yuv420p"))
    body = _upload(client, src).json()  # type: ignore[attr-defined]
    assert body["metadata"]["has_audio"] is False
    assert body["metadata"]["audio_codec"] is None


@needs_ffmpeg
def test_audio_only_mp4_is_rejected_with_reason(client: TestClient, tmp_path: Path) -> None:
    src = _make(tmp_path / "audio.mp4", *AUDIO)
    response = _upload(client, src)
    assert response.status_code == 422  # type: ignore[attr-defined]
    assert response.json()["detail"]["code"] == "no_video_stream"  # type: ignore[attr-defined]


@needs_ffmpeg
def test_fake_mp4_is_rejected_and_no_partial_file_left(client: TestClient, tmp_path: Path) -> None:
    fake = tmp_path / "fake.mp4"
    fake.write_text("this is not a video", encoding="utf-8")
    response = _upload(client, fake)
    assert response.status_code == 422  # type: ignore[attr-defined]
    assert response.json()["detail"]["code"] == "unreadable"  # type: ignore[attr-defined]
    media_dir = tmp_path / "data" / "media"
    assert list(media_dir.iterdir()) == []


def test_wrong_extension_is_rejected(client: TestClient, tmp_path: Path) -> None:
    other = tmp_path / "notes.txt"
    other.write_text("hello", encoding="utf-8")
    response = _upload(client, other)
    assert response.status_code == 422  # type: ignore[attr-defined]
    assert response.json()["detail"]["code"] == "not_mp4"  # type: ignore[attr-defined]


def test_empty_file_is_rejected(client: TestClient, tmp_path: Path) -> None:
    empty = tmp_path / "empty.mp4"
    empty.write_bytes(b"")
    response = _upload(client, empty)
    assert response.json()["detail"]["code"] == "empty_file"  # type: ignore[attr-defined]


def test_path_traversal_ids_are_not_accepted(client: TestClient) -> None:
    assert client.delete("/api/media/..%2F..%2Fetc").status_code == 404
    assert client.delete("/api/media/not-a-uuid").status_code == 404


def test_missing_ffprobe_gives_actionable_error(tmp_path: Path) -> None:
    settings = Settings(
        host="127.0.0.1",
        port=8000,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="definitely-missing-ffprobe",
        data_dir=tmp_path / "data",
    )
    client = TestClient(create_app(settings))
    src = tmp_path / "x.mp4"
    src.write_bytes(b"\x00" * 16)
    response = client.post("/api/media", files={"file": ("x.mp4", src.read_bytes(), "video/mp4")})
    detail = response.json()["detail"]
    assert detail["code"] == "ffprobe_missing"
    assert "Install FFmpeg" in detail["message"]


def test_parse_rejects_non_mp4_container() -> None:
    raw = '{"format": {"format_name": "matroska,webm", "duration": "2"}, "streams": []}'
    with pytest.raises(MediaError) as info:
        parse_probe_output(raw)
    assert info.value.code == "not_mp4"


def test_parse_ignores_cover_art_as_video() -> None:
    raw = (
        '{"format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "3.5"},'
        ' "streams": [{"codec_type": "audio", "codec_name": "aac"},'
        ' {"codec_type": "video", "codec_name": "mjpeg", "disposition": {"attached_pic": 1}}]}'
    )
    with pytest.raises(MediaError) as info:
        parse_probe_output(raw)
    assert info.value.code == "no_video_stream"


def test_parse_uses_integer_milliseconds() -> None:
    raw = (
        '{"format": {"format_name": "mov,mp4", "duration": "12.3456"},'
        ' "streams": [{"codec_type": "video", "width": 1080, "height": 1920,'
        ' "avg_frame_rate": "30000/1001", "codec_name": "h264"}]}'
    )
    meta = parse_probe_output(raw)
    assert meta.duration_ms == 12346
    assert meta.frame_rate == 29.97
    assert (meta.width, meta.height) == (1080, 1920)
