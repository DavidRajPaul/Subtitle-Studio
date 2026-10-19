"""Background jobs (transcription, model downloads) with progress and cancellation.

One worker thread runs jobs in order, so a long transcription never competes with another
for the CPU. Job state lives in memory: it is lost when the backend restarts, and the UI then
says the job is unknown and offers to start again.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Literal

log = logging.getLogger(__name__)

JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
MAX_KEPT_JOBS = 50


class JobError(Exception):
    """A user-facing failure with a stable code and an actionable message."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class JobCancelled(Exception):
    """Raised inside a job when the user asked to cancel it."""


@dataclass
class Job:
    id: str
    kind: str
    status: JobStatus = "queued"
    progress: float | None = None  # 0..1, or None when the amount of work is unknown
    message: str = "Waiting to start…"
    result: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    created: float = field(default_factory=time.time)
    cancel_requested: threading.Event = field(default_factory=threading.Event)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": (
                {"code": self.error_code, "message": self.error_message}
                if self.status == "failed"
                else None
            ),
        }


class JobContext:
    """What a running job may do: report progress and notice cancellation."""

    def __init__(self, job: Job, lock: threading.Lock) -> None:
        self._job = job
        self._lock = lock

    @property
    def cancelled(self) -> bool:
        return self._job.cancel_requested.is_set()

    def check(self) -> None:
        if self.cancelled:
            raise JobCancelled

    def report(self, progress: float | None, message: str | None = None) -> None:
        with self._lock:
            if progress is not None:
                progress = min(1.0, max(0.0, progress))
            self._job.progress = progress
            if message is not None:
                self._job.message = message


JobFn = Callable[[JobContext], dict[str, Any]]


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="subtitle-job")

    def submit(self, kind: str, fn: JobFn) -> Job:
        job = Job(id=str(uuid.uuid4()), kind=kind)
        with self._lock:
            self._jobs[job.id] = job
            self._prune()
        self._pool.submit(self._run, job, fn)
        return job

    def _run(self, job: Job, fn: JobFn) -> None:
        with self._lock:
            if job.cancel_requested.is_set():
                job.status, job.message = "cancelled", "Cancelled."
                return
            job.status, job.message = "running", "Starting…"
        ctx = JobContext(job, self._lock)
        try:
            result = fn(ctx)
            ctx.check()  # a cancel that arrived during the last step still wins
        except JobCancelled:
            with self._lock:
                job.status, job.message = "cancelled", "Cancelled. Nothing was changed."
            return
        except JobError as err:
            with self._lock:
                job.status, job.message = "failed", err.message
                job.error_code, job.error_message = err.code, err.message
            return
        except Exception:  # noqa: BLE001 - a job must never take the worker down
            log.exception("Job %s (%s) failed", job.id, job.kind)
            with self._lock:
                job.status = "failed"
                job.error_code = "unexpected"
                job.error_message = job.message = (
                    "Something went wrong while processing. Try again; if it keeps happening, "
                    "check the backend log."
                )
            return
        with self._lock:
            job.status, job.progress, job.message, job.result = "succeeded", 1.0, "Done.", result

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def snapshot(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return job.to_dict() if job else None

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status not in ("queued", "running"):
                return False
            job.cancel_requested.set()
            job.message = "Cancelling…"
            return True

    def _prune(self) -> None:
        finished = [
            j for j in self._jobs.values() if j.status in ("succeeded", "failed", "cancelled")
        ]
        excess = len(self._jobs) - MAX_KEPT_JOBS
        for job in sorted(finished, key=lambda j: j.created)[: max(0, excess)]:
            del self._jobs[job.id]

    def shutdown(self) -> None:
        for job in list(self._jobs.values()):
            job.cancel_requested.set()
        self._pool.shutdown(wait=False, cancel_futures=True)
