"""Pydantic models shared by the API and the versioned project file."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.text_import import MAX_SEGMENTS

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"
TIME_BOUND = 1_000_000_000


class TimingSettingsIn(BaseModel):
    chars_per_second: float = Field(default=17.0, gt=0, le=60)
    min_duration_ms: int = Field(default=1000, ge=1, le=60_000)
    max_duration_ms: int = Field(default=7000, ge=1, le=600_000)
    gap_ms: int = Field(default=100, ge=0, le=5000)


class MediaRef(BaseModel):
    id: str = Field(pattern=r"^[0-9a-fA-F-]{32,36}$")
    filename: str = Field(max_length=255)
    duration_ms: int = Field(gt=0)
    width: int = Field(ge=0)
    height: int = Field(ge=0)
    has_audio: bool


class CueDoc(BaseModel):
    """The one canonical cue: used by the editor, preview, project file (and later SRT/render)."""

    id: str = Field(min_length=1, max_length=64)
    text: str = Field(max_length=5000)
    start_ms: int = Field(ge=-TIME_BOUND, le=TIME_BOUND)
    end_ms: int = Field(ge=-TIME_BOUND, le=TIME_BOUND)


class BackgroundStyle(BaseModel):
    enabled: bool = False
    color: str = Field(default="#000000", pattern=HEX_COLOR)
    opacity: float = Field(default=0.6, ge=0, le=1)


class StyleDoc(BaseModel):
    """Global subtitle style. font_size is in pixels for a 1080-pixel-tall video (scaled)."""

    font_family: str = Field(default="sans", max_length=40)
    font_size: int = Field(default=48, ge=8, le=200)
    text_color: str = Field(default="#FFFFFF", pattern=HEX_COLOR)
    bold: bool = False
    italic: bool = False
    outline_color: str = Field(default="#000000", pattern=HEX_COLOR)
    outline_px: int = Field(default=2, ge=0, le=12)
    shadow: bool = True
    background: BackgroundStyle = Field(default_factory=BackgroundStyle)
    position: Literal["top", "middle", "bottom"] = "bottom"
    align: Literal["left", "center", "right"] = "center"
    safe_margin_pct: int = Field(default=5, ge=0, le=25)
    vertical_offset_px: int = Field(default=0, ge=-300, le=300)


class TimingDoc(BaseModel):
    mode: Literal["equal", "readable", "fit", "manual"] = "readable"
    segmentation: Literal["line", "paragraph", "sentence"] = "line"
    settings: TimingSettingsIn = Field(default_factory=TimingSettingsIn)


class ProjectDoc(BaseModel):
    version: Literal[1] = 1
    id: str = Field(pattern=r"^[0-9a-fA-F-]{32,36}$")
    name: str = Field(min_length=1, max_length=120)
    workflow: Literal["speech", "text"]
    created_at: str | None = None
    updated_at: str | None = None
    media: MediaRef
    cues: list[CueDoc] = Field(max_length=MAX_SEGMENTS)
    style: StyleDoc = Field(default_factory=StyleDoc)
    timing: TimingDoc = Field(default_factory=TimingDoc)


class ValidateIn(BaseModel):
    cues: list[CueDoc] = Field(max_length=MAX_SEGMENTS)
    duration_ms: int = Field(gt=0)
    settings: TimingSettingsIn = Field(default_factory=TimingSettingsIn)
