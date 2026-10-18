from __future__ import annotations

import shutil

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.diagnostics import check_tool
from app.main import create_app


def _settings(ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe") -> Settings:
    return Settings(host="127.0.0.1", port=8000, ffmpeg_bin=ffmpeg, ffprobe_bin=ffprobe)


def test_default_settings_bind_to_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUBTITLE_STUDIO_HOST", raising=False)
    assert Settings.from_env().host == "127.0.0.1"


def test_health_reports_ok_when_ffmpeg_tools_are_installed() -> None:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        pytest.skip("FFmpeg/FFprobe not installed on this machine")
    client = TestClient(create_app(_settings()))
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["tools"]["ffmpeg"]["available"] is True
    assert body["tools"]["ffmpeg"]["version"].startswith("ffmpeg version")
    assert body["tools"]["ffprobe"]["available"] is True


def test_health_is_degraded_with_actionable_detail_when_tool_missing() -> None:
    client = TestClient(create_app(_settings(ffmpeg="definitely-not-a-real-ffmpeg-binary")))
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["tools"]["ffmpeg"]["available"] is False
    assert "not found" in body["tools"]["ffmpeg"]["detail"]
    assert "Install FFmpeg" in body["tools"]["ffmpeg"]["detail"]


def test_check_tool_does_not_use_a_shell() -> None:
    # A shell metacharacter in the configured name must be treated as a literal, unknown binary.
    status = check_tool("ffmpeg", "ffmpeg; echo injected")
    assert status.available is False
