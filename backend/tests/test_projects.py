from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import ProjectDoc
from app.projects import ProjectError, ProjectStore

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg/FFprobe not installed",
)


def make_doc(media_id: str | None = None, name: str = "My project") -> dict[str, Any]:
    return {
        "version": 1,
        "id": str(uuid.uuid4()),
        "name": name,
        "workflow": "text",
        "media": {
            "id": media_id or str(uuid.uuid4()),
            "filename": "clip.mp4",
            "duration_ms": 12_000,
            "width": 1280,
            "height": 720,
            "has_audio": False,
        },
        "cues": [
            {"id": "a1", "text": "வணக்கம்\nஉலகம்", "start_ms": 0, "end_ms": 1500},
            {"id": "b2", "text": "日本語 🎬", "start_ms": 1600, "end_ms": 3000},
        ],
        "style": {"font_size": 60, "position": "top", "background": {"enabled": True}},
        "timing": {"mode": "fit", "segmentation": "sentence"},
    }


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


# ---- Store ---------------------------------------------------------------------------------


def test_save_and_load_round_trip_preserves_everything(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "projects")
    doc = ProjectDoc.model_validate(make_doc())
    saved = store.save(doc)
    loaded = store.load(doc.id)
    assert loaded is not None
    assert loaded.cues == doc.cues
    assert loaded.style == doc.style
    assert loaded.timing == doc.timing
    assert loaded.cues[0].text == "வணக்கம்\nஉலகம்"
    assert loaded.created_at and loaded.updated_at == saved.updated_at
    raw = (tmp_path / "projects" / f"{doc.id}.json").read_text(encoding="utf-8")
    assert "வணக்கம்" in raw  # stored as readable UTF-8, not escaped
    assert json.loads(raw)["version"] == 1


def test_resaving_keeps_created_at_and_leaves_no_temp_files(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "projects")
    doc = ProjectDoc.model_validate(make_doc())
    first = store.save(doc)
    second = store.save(doc.model_copy(update={"name": "Renamed"}))
    assert second.created_at == first.created_at
    assert store.load(doc.id).name == "Renamed"  # type: ignore[union-attr]
    assert list((tmp_path / "projects").glob("*.tmp")) == []


def test_ids_cannot_escape_the_folder(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "projects")
    assert store.load("../../etc/passwd") is None
    assert store.delete("../x") is False


def test_damaged_file_is_reported_and_left_untouched(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "projects")
    pid = str(uuid.uuid4())
    (tmp_path / "projects").mkdir()
    path = tmp_path / "projects" / f"{pid}.json"
    path.write_text("{ not json", encoding="utf-8")
    with pytest.raises(ProjectError) as info:
        store.load(pid)
    assert info.value.code == "unreadable"
    assert path.read_text(encoding="utf-8") == "{ not json"
    assert store.list() == []  # skipped, not deleted
    assert path.exists()


def test_newer_version_is_refused_not_overwritten(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "projects")
    data = make_doc()
    data["version"] = 2
    pid = data["id"]
    (tmp_path / "projects").mkdir()
    path = tmp_path / "projects" / f"{pid}.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ProjectError):
        store.load(pid)
    assert json.loads(path.read_text(encoding="utf-8"))["version"] == 2


# ---- API -----------------------------------------------------------------------------------


def test_api_save_list_get_delete(client: TestClient) -> None:
    doc = make_doc()
    pid = doc["id"]
    assert client.get("/api/projects").json() == {"projects": []}
    assert client.put(f"/api/projects/{pid}", json=doc).status_code == 200
    listing = client.get("/api/projects").json()["projects"]
    assert [p["id"] for p in listing] == [pid]
    assert listing[0]["cue_count"] == 2
    assert listing[0]["media_available"] is False
    got = client.get(f"/api/projects/{pid}").json()
    assert got["cues"][1]["text"] == "日本語 🎬"
    assert got["style"]["background"]["enabled"] is True
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_api_rejects_invalid_documents_without_saving(client: TestClient) -> None:
    doc = make_doc()
    doc["style"]["text_color"] = "red"
    assert client.put(f"/api/projects/{doc['id']}", json=doc).status_code == 422
    doc = make_doc()
    doc["style"]["font_size"] = 5
    assert client.put(f"/api/projects/{doc['id']}", json=doc).status_code == 422
    assert client.get("/api/projects").json() == {"projects": []}


def test_api_id_mismatch_and_bad_ids(client: TestClient) -> None:
    doc = make_doc()
    other = str(uuid.uuid4())
    assert client.put(f"/api/projects/{other}", json=doc).json()["detail"]["code"] == "id_mismatch"
    assert client.get("/api/projects/not-a-uuid").status_code == 404
    assert client.delete("/api/projects/not-a-uuid").status_code == 404


def test_api_validate_reports_overlap_and_range_without_changing_cues(client: TestClient) -> None:
    body = {
        "duration_ms": 5000,
        "cues": [
            {"id": "a", "text": "x", "start_ms": 0, "end_ms": 3000},
            {"id": "b", "text": "y", "start_ms": 2000, "end_ms": 6000},
        ],
    }
    issues = client.post("/api/timing/validate", json=body).json()["issues"]
    assert {(i["code"], i["cue_number"]) for i in issues} >= {("overlap", 2), ("out_of_range", 2)}


# ---- Media file and delete protection ------------------------------------------------------


def _make_video(path: Path) -> Path:
    subprocess.run(  # noqa: S603
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x120:rate=25",
            "-t",
            "1",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )
    return path


@needs_ffmpeg
def test_media_file_is_served_with_range_support(client: TestClient, tmp_path: Path) -> None:
    src = _make_video(tmp_path / "v.mp4")
    with src.open("rb") as fh:
        media = client.post("/api/media", files={"file": ("v.mp4", fh, "video/mp4")}).json()
    url = f"/api/media/{media['id']}/file"
    full = client.get(url)
    assert full.status_code == 200
    assert full.headers["content-type"] == "video/mp4"
    assert full.content == src.read_bytes()
    part = client.get(url, headers={"Range": "bytes=0-99"})
    assert part.status_code == 206
    assert len(part.content) == 100
    assert client.get("/api/media/not-a-uuid/file").status_code == 404
    assert client.get(f"/api/media/{uuid.uuid4()}/file").status_code == 404


@needs_ffmpeg
def test_saved_projects_keep_their_video_and_deleting_the_project_removes_it(
    client: TestClient, tmp_path: Path
) -> None:
    src = _make_video(tmp_path / "v.mp4")
    with src.open("rb") as fh:
        media = client.post("/api/media", files={"file": ("v.mp4", fh, "video/mp4")}).json()
    doc = make_doc(media_id=media["id"])
    client.put(f"/api/projects/{doc['id']}", json=doc)
    copy = tmp_path / "data" / "media" / f"{media['id']}.mp4"
    assert client.get("/api/projects").json()["projects"][0]["media_available"] is True
    # An import screen closing must not delete a video a saved project depends on.
    assert client.delete(f"/api/media/{media['id']}").status_code == 204
    assert copy.exists()
    # A second project sharing the video keeps it alive when the first is deleted.
    other = make_doc(media_id=media["id"], name="Other")
    client.put(f"/api/projects/{other['id']}", json=other)
    client.delete(f"/api/projects/{doc['id']}")
    assert copy.exists()
    client.delete(f"/api/projects/{other['id']}")
    assert not copy.exists()
