"""In-memory progress for runs and previews (single-worker).

The pipeline reports its stage and counts as it works; the API reads them
back for UI polling. Bounded (entry cap + TTL eviction) so abandoned
tickets cannot grow memory. Thread-safe: worker threads report while the
event loop reads.
"""

import threading
import time
from dataclasses import dataclass, field

STAGES = ("queued", "source", "enrich", "filter", "done", "error", "cancelled")


class PipelineCancelled(Exception):
    """Raised when a progress ticket is cancelled mid-pipeline."""


@dataclass
class Progress:
    stage: str = "queued"
    done: int = 0
    total: int = 0
    calls: int = 0
    error: str | None = None
    updated_at: float = field(default_factory=time.monotonic)


class ProgressStore:
    """Thread-safe key -> Progress map with TTL eviction."""

    def __init__(self, *, ttl_seconds: float = 900, max_entries: int = 200) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._lock = threading.Lock()
        self._entries: dict[str, Progress] = {}

    def start(self, key: str) -> Progress:
        """(Re)create a queued entry, evicting stale ones first."""
        with self._lock:
            self._prune_locked()
            progress = Progress()
            self._entries[key] = progress
            return progress

    def report(self, key: str, stage: str, done: int, total: int) -> None:
        with self._lock:
            progress = self._entries.get(key)
            if progress is None:
                return
            if progress.stage in ("cancelled", "error", "done"):
                # Terminal states stick: late worker threads must not flip
                # a cancelled run back to "enrich".
                return
            progress.stage = stage
            progress.done = done
            progress.total = total
            progress.updated_at = time.monotonic()

    def read(self, key: str) -> Progress | None:
        with self._lock:
            return self._entries.get(key)

    def cancel(self, key: str) -> bool:
        """Flag cancellation; the pipeline checks it between tracks."""
        with self._lock:
            progress = self._entries.get(key)
            if progress is None:
                return False
            progress.stage = "cancelled"
            progress.updated_at = time.monotonic()
            return True

    def is_cancelled(self, key: str) -> bool:
        with self._lock:
            progress = self._entries.get(key)
            return progress is not None and progress.stage == "cancelled"

    def bump_calls(self, key: str, count: int = 1) -> None:
        """Add completed Last.fm calls to the ticket (liveliness counter).

        Ignored on missing or terminal tickets, like report().
        """
        with self._lock:
            progress = self._entries.get(key)
            if progress is None:
                return
            if progress.stage in ("cancelled", "error", "done"):
                return
            progress.calls += count
            progress.updated_at = time.monotonic()

    def finish(self, key: str, error: str | None = None) -> None:
        with self._lock:
            progress = self._entries.get(key)
            if progress is None:
                return
            progress.stage = "error" if error else "done"
            progress.error = error
            progress.updated_at = time.monotonic()

    def _prune_locked(self) -> None:
        now = time.monotonic()
        stale = [
            key
            for key, progress in self._entries.items()
            if now - progress.updated_at > self._ttl
        ]
        for key in stale:
            del self._entries[key]
        while len(self._entries) >= self._max:
            oldest = min(self._entries, key=lambda k: self._entries[k].updated_at)
            del self._entries[oldest]


store = ProgressStore()
