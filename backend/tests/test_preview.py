"""Tests for POST /api/automations/preview validation and error semantics.

The preview body is validated via AutomationCreate (source/period Literals,
cron parseable by the scheduler, maxSize bounded 1-200 with explicit 0->50):
- invalid source type, period, cron, maxSize, or missing name -> 422
- upstream Last.fm failure -> 502 with generic detail (no str(e) leak)
- success -> 200 with {tracks, total}
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email, link_lastfm


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account."""
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert reg.status_code == 201
    client.cookies.clear()
    login = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert login.status_code == 200
    link = await link_lastfm(client, "preview_user")
    assert link.status_code == 200


def _preview_body(sort: str = "most_played", **automation_overrides) -> dict:
    automation = {
        "name": "preview",
        "window": {"length": {"amount": 3, "unit": "month"}},
        "sort": sort,
        "output": {"maxSize": 5},
    }
    automation.update(automation_overrides)
    return {"automation": automation}


@pytest.mark.asyncio
async def test_preview_unknown_sort_returns_422(client: AsyncClient):
    """An unsupported sort must return 422 (schema validation)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.post(
            "/api/automations/preview",
            json=_preview_body("bogus_sort"),
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_invalid_window_returns_422(client: AsyncClient):
    """A window unit or amount outside the schema must return 422."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        for length in ({"amount": 2, "unit": "fortnight"}, {"amount": 0, "unit": "day"}):
            body = _preview_body(window={"length": length})
            resp = await client.post("/api/automations/preview", json=body)
            assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_max_size_bounds_return_422(client: AsyncClient):
    """maxSize is bounded to 1-200 (after the explicit 0 -> 50 mapping)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        for bad in (-1, 201, 10000):
            body = _preview_body()
            body["automation"]["output"] = {"maxSize": bad}
            resp = await client.post("/api/automations/preview", json=body)
            assert resp.status_code == 422, f"maxSize={bad} should be rejected"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_max_size_zero_means_default(client: AsyncClient):
    """maxSize=0 explicitly maps to the default 50 instead of 0 tracks."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tracks = [
            {"artist": "Artist A", "first_played": 0, "title": "Song A"},
            {"artist": "Artist B", "first_played": 0, "title": "Song B"},
            {"artist": "Artist C", "first_played": 0, "title": "Song C"},
        ]
        body = _preview_body()
        body["automation"]["output"] = {"maxSize": 0}
        with patch("services.automation_runner.get_window_tracks", return_value=tracks):
            resp = await client.post("/api/automations/preview", json=body)
        assert resp.status_code == 200
        assert resp.json()["total"] == 3
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_invalid_cron_returns_422(client: AsyncClient):
    """A cron the scheduler cannot parse must return 422."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.post(
            "/api/automations/preview",
            json=_preview_body(cron="not a cron"),
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_missing_name_returns_422(client: AsyncClient):
    """The previewed draft is validated like a create: name is required."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        body = _preview_body()
        del body["automation"]["name"]
        resp = await client.post("/api/automations/preview", json=body)
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)






@pytest.mark.asyncio
async def test_preview_success_returns_tracks_and_total(client: AsyncClient):
    """A successful preview returns 200 with {tracks, total}."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tracks = [
            {"artist": "Artist A", "first_played": 0, "title": "Song A"},
            {"artist": "Artist B", "first_played": 0, "title": "Song B"},
        ]
        with patch("services.automation_runner.get_window_tracks", return_value=tracks):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body(),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == tracks
        assert data["total"] == 2
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_applies_server_side_filters(client: AsyncClient):
    """A successful preview applies the filter tree server-side and reports
    before_filter/source_tracks alongside the existing {tracks, total} keys."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tracks = [
            {"artist": "Artist A", "first_played": 0, "title": "Song A", "userplaycount": 5},
            {"artist": "Artist B", "first_played": 0, "title": "Song B", "userplaycount": 20},
        ]
        body = {
            "automation": {
                "name": "preview",
                "window": {"length": {"amount": 3, "unit": "month"}}, "sort": "most_played",
                "output": {"maxSize": 50},
                "filterGroups": [
                    {
                        "id": "g1",
                        "logic": "AND",
                        "conditions": [
                            {
                                "id": "c1",
                                "field": "userplaycount",
                                "operator": "gte",
                                "value": 10,
                                "valueMax": None,
                                "countMin": 0,
                                "tagSource": "artist",
                            }
                        ],
                        "groups": [],
                    }
                ],
            }
        }
        with patch("services.automation_runner.get_window_tracks", return_value=tracks):
            resp = await client.post(
                "/api/automations/preview",
                json=body,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == [tracks[1]]
        assert data["total"] == 1
        assert data["before_filter"] == 2
        assert data["source_tracks"] == tracks
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_of_a_schedule_shows_what_a_run_makes_and_says_which_period(client: AsyncClient):
    """Same period as a run, and the screen gets its dates; without a schedule, up to now."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        body = _preview_body(cron="0 0 1 3,6,9,12 *")
        with patch("services.automation_runner.get_window_tracks", return_value=[]) as window_tracks:
            resp = await client.post("/api/automations/preview", json=body)
            assert resp.status_code == 200
            end = window_tracks.call_args.args[3]
            data = resp.json()
            rolling = await client.post("/api/automations/preview", json=_preview_body())
            assert window_tracks.call_args.args[3] > end
        assert (end.month, end.day) in [(3, 1), (6, 1), (9, 1), (12, 1)]
        assert data["period"]["end"] < end.date().isoformat()
        assert data["period"]["end"][-2:] in ("28", "29", "30", "31")
        assert data["period"]["start"][-2:] == "01"
        assert data["next_run"] > end.date().isoformat()
        assert "period" not in rolling.json()
        assert "next_run" not in rolling.json()
    finally:
        await _cleanup_user(email=email)
