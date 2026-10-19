"""Versioned local project files (JSON), written atomically under an app-owned directory."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

from app.models import ProjectDoc


class ProjectError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class ProjectStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, project_id: str) -> Path:
        # Rejects anything that is not a plain UUID, so ids can never escape the folder.
        return self.root / f"{uuid.UUID(project_id)}.json"

    def save(self, doc: ProjectDoc) -> ProjectDoc:
        try:
            path = self._path(doc.id)
        except ValueError as exc:
            raise ProjectError("invalid_id", "That project id is not valid.") from exc
        self.root.mkdir(parents=True, exist_ok=True)
        previous = self.load(doc.id) if path.exists() else None
        now = _now()
        saved = doc.model_copy(
            update={
                "created_at": (previous.created_at if previous else None) or doc.created_at or now,
                "updated_at": now,
            }
        )
        # Write to a temp file first so a crash can never leave a half-written project.
        temp = path.with_suffix(".tmp")
        try:
            temp.write_text(saved.model_dump_json(indent=2), encoding="utf-8")
            temp.replace(path)
        except OSError as exc:
            temp.unlink(missing_ok=True)
            raise ProjectError(
                "write_failed", "The project could not be written to disk. Check free space."
            ) from exc
        return saved

    def load(self, project_id: str) -> ProjectDoc | None:
        try:
            path = self._path(project_id)
        except ValueError:
            return None
        if not path.exists():
            return None
        try:
            return ProjectDoc.model_validate_json(path.read_text(encoding="utf-8"))
        except (ValidationError, OSError, UnicodeDecodeError) as exc:
            raise ProjectError(
                "unreadable",
                "This project file could not be read. It may be damaged or from a newer "
                "version of Subtitle Studio. The file was left untouched.",
            ) from exc

    def list(self) -> list[ProjectDoc]:
        if not self.root.exists():
            return []
        docs: list[ProjectDoc] = []
        for path in self.root.glob("*.json"):
            try:
                doc = self.load(path.stem)
            except ProjectError:
                continue  # unreadable files are skipped, never deleted
            if doc is not None:
                docs.append(doc)
        docs.sort(key=lambda d: (d.updated_at or "", d.id), reverse=True)
        return docs

    def delete(self, project_id: str) -> bool:
        try:
            path = self._path(project_id)
        except ValueError:
            return False
        if not path.exists():
            return False
        path.unlink()
        return True

    def referenced_media_ids(self) -> set[str]:
        return {d.media.id.lower() for d in self.list()}
