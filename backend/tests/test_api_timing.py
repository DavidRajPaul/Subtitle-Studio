from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


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


def _parse(client: TestClient, raw: bytes, name: str = "script.txt", mode: str = "line") -> Any:
    return client.post(
        "/api/text/parse",
        files={"file": (name, raw, "text/plain")},
        data={"segmentation": mode},
    )


def test_parse_tamil_script_by_sentence(client: TestClient) -> None:
    raw = "﻿வணக்கம் நண்பர்களே. இன்று வரலாறு!\nமீண்டும் சந்திப்போம்.".encode()
    response = _parse(client, raw, mode="sentence")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 3
    assert body["segments"][0] == "வணக்கம் நண்பர்களே."


def test_parse_rejects_wrong_extension_and_bad_encoding(client: TestClient) -> None:
    wrong = _parse(client, b"hi", name="script.docx")
    assert wrong.status_code == 422
    assert wrong.json()["detail"]["code"] == "not_txt"
    latin = _parse(client, "café".encode("latin-1"))
    assert latin.json()["detail"]["code"] == "not_utf8"
    assert "UTF-8" in latin.json()["detail"]["message"]


def test_parse_rejects_empty_and_oversized(client: TestClient) -> None:
    assert _parse(client, b"  \n").json()["detail"]["code"] == "empty_text"
    big = _parse(client, b"a\n" * (1024 * 1024 + 1))
    assert big.json()["detail"]["code"] == "too_large"


def test_generate_timing_returns_cues_issues_and_summary(client: TestClient) -> None:
    response = client.post(
        "/api/timing/generate",
        json={"segments": ["Hi everyone."], "mode": "readable", "duration_ms": 12_000},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["cues"][0]["start_ms"] == 0
    assert body["cues"][0]["end_ms"] == 1000
    assert body["cues"][0]["text"] == "Hi everyone."
    assert body["cues"][0]["id"]
    assert body["summary"]["blank_end_ms"] == 11_000
    assert body["summary"]["cue_count"] == 1
    assert body["issues"] == []


def test_generate_timing_manual_values_and_conflict_warnings(client: TestClient) -> None:
    response = client.post(
        "/api/timing/generate",
        json={
            "segments": ["a", "b"],
            "mode": "manual",
            "duration_ms": 5000,
            "manual": [
                {"start_ms": 0, "duration_ms": 3000},
                {"start_ms": 2000, "duration_ms": 4000},
            ],
        },
    )
    body = response.json()
    assert [(c["start_ms"], c["end_ms"]) for c in body["cues"]] == [(0, 3000), (2000, 6000)]
    assert {i["code"] for i in body["issues"]} >= {"overlap", "out_of_range"}


def test_generate_timing_reports_bad_settings_with_code_and_message(client: TestClient) -> None:
    response = client.post(
        "/api/timing/generate",
        json={
            "segments": ["a"],
            "mode": "fit",
            "duration_ms": 5000,
            "settings": {"min_duration_ms": 9000, "max_duration_ms": 2000},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_settings"
