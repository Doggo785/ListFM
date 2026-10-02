"""Unit tests for the in-memory progress store (no DB, no network)."""

import time
from unittest.mock import patch

from services.progress import ProgressStore


def test_start_read_report_roundtrip():
    store = ProgressStore()
    assert store.read("k") is None
    store.start("k")
    assert store.read("k").stage == "queued"
    store.report("k", "enrich", 12, 50)
    progress = store.read("k")
    assert (progress.stage, progress.done, progress.total) == ("enrich", 12, 50)


def test_report_unknown_key_is_ignored():
    store = ProgressStore()
    store.report("ghost", "enrich", 1, 2)
    assert store.read("ghost") is None


def test_cancel_flags_and_finish_keeps_cancelled_readable():
    store = ProgressStore()
    assert store.cancel("ghost") is False
    store.start("k")
    assert store.cancel("k") is True
    assert store.is_cancelled("k") is True
    assert store.read("k").stage == "cancelled"


def test_terminal_stage_sticks_against_late_reports():
    store = ProgressStore()
    store.start("k")
    store.report("k", "enrich", 3, 10)
    assert store.read("k").stage == "enrich"
    store.cancel("k")
    store.report("k", "enrich", 5, 10)
    finished = store.read("k")
    assert finished.stage == "cancelled"
    assert (finished.done, finished.total) == (3, 10)


def test_finish_marks_done_or_error():
    store = ProgressStore()
    store.start("ok")
    store.finish("ok")
    assert store.read("ok").stage == "done"
    store.start("bad")
    store.finish("bad", error="boom")
    finished = store.read("bad")
    assert finished.stage == "error"
    assert finished.error == "boom"


def test_ttl_evicts_stale_entries():
    store = ProgressStore(ttl_seconds=10)
    store.start("old")
    with patch("services.progress.time.monotonic", return_value=time.monotonic() + 9999):
        store.start("new")
    assert store.read("old") is None
    assert store.read("new").stage == "queued"


def test_cap_evicts_oldest_first():
    store = ProgressStore(ttl_seconds=9999, max_entries=2)
    store.start("first")
    store.start("second")
    store.start("third")
    assert store.read("first") is None
    assert store.read("second") is not None
    assert store.read("third") is not None
