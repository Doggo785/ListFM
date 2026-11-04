"""The console lines read as the owner validated them, and carry no API key."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient
from services.activity_log import (
    automation_label,
    format_duration,
    log_activity,
    pipeline_summary,
)

from .conftest import _unique_email
from .test_recent_tracks_cache import _register_login_link


def test_lines_read_as_validated(activity_lines):
    log_activity("sync", "assawolf", "page 12/153  +1000 écoutes")
    log_activity("tags", "assawolf", "1200/9552 artistes")
    summary = pipeline_summary({"before_filter": 5708, "after_filter": 135, "total": 50}, 0.4)
    log_activity("run", automation_label("TEST"), summary)
    assert activity_lines() == [
        "sync   assawolf  page 12/153  +1000 écoutes",
        "tags   assawolf  1200/9552 artistes",
        'run    "TEST"    5708 → 135 → 50 morceaux  0,4 s',
    ]


def test_durations():
    assert format_duration(0.44) == "0,4 s"
    assert format_duration(432.9) == "7 min 12 s"


def test_a_name_cannot_forge_a_line():
    assert automation_label('a\nsync "b"') == '"a\\nsync \\"b\\""'
    assert automation_label("Été") == '"Été"'


@pytest.mark.asyncio
async def test_a_lastfm_error_logs_its_class_never_its_message(client: AsyncClient, activity_lines, caplog):
    await _register_login_link(client, _unique_email())
    # What httpx puts in an error message: the URL, so the API key.
    leak = RuntimeError("Server error for url 'https://ws.audioscrobbler.com/2.0/?api_key=SECRET'")
    with patch("routers.users.get_user_info", side_effect=leak):
        assert (await client.get("/api/info")).status_code == 502
    with patch("routers.users.get_recent_tracks", side_effect=leak):
        assert (await client.get("/api/recent-tracks")).status_code == 502
    assert activity_lines() == ["lastfm recents_user échec : RuntimeError"] * 2
    assert "SECRET" not in caplog.text
