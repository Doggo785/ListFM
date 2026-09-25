"""Tests for POST /api/automations/preview validation and error semantics.

The preview body is validated via AutomationCreate (source/period Literals,
cron parseable by the scheduler, maxSize bounded 1-200 with explicit 0->50):
- invalid source type, period, cron, maxSize, or missing name -> 422
- upstream Last.fm failure -> 502 with generic detail (no str(e) leak)
- success -> 200 with {tracks, total}
"""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account (mocked get_user_info)."""
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
    mock_info = {"username": "preview_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "preview_user"},
        )
    assert link.status_code == 200


def _preview_body(source_type: str, **automation_overrides) -> dict:
    automation = {
        "name": "preview",
        "source": {"type": source_type, "period": "3m"},
        "output": {"maxSize": 5},
    }
    automation.update(automation_overrides)
    return {"automation": automation}


@pytest.mark.asyncio
async def test_preview_unknown_source_returns_422(client: AsyncClient):
    """An unsupported source type must return 422 (schema validation)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.post(
            "/api/automations/preview",
            json=_preview_body("bogus_source"),
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_invalid_period_returns_422(client: AsyncClient):
    """An unsupported period must return 422 (schema validation)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        body = _preview_body("top_tracks")
        body["automation"]["source"]["period"] = "fortnight"
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
            body = _preview_body("top_tracks")
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
            {"artist": "Artist A", "title": "Song A"},
            {"artist": "Artist B", "title": "Song B"},
            {"artist": "Artist C", "title": "Song C"},
        ]
        body = _preview_body("top_tracks")
        body["automation"]["output"] = {"maxSize": 0}
        with patch("services.automation_runner.get_top_tracks", return_value=tracks), patch(
            "services.enrich_cache.enrich_tracks", return_value=tracks
        ):
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
            json=_preview_body("top_tracks", cron="not a cron"),
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
        body = _preview_body("top_tracks")
        del body["automation"]["name"]
        resp = await client.post("/api/automations/preview", json=body)
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_upstream_failure_returns_502(client: AsyncClient):
    """An upstream Last.fm failure must return 502 with a generic detail."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        with patch(
            "services.automation_runner.get_top_tracks",
            side_effect=Exception("secret internal traceback"),
        ):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body("top_tracks"),
            )
        assert resp.status_code == 502
        detail = resp.json()["detail"]
        assert detail == "Unable to fetch tracks from Last.fm"
        assert "secret internal traceback" not in detail
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_second_identical_run_hits_cache(client: AsyncClient):
    """An identical preview right after the first serves from cache (no live)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        suffix = uuid.uuid4().hex[:8]
        tracks = [
            {"artist": f"Preview Artist {suffix}", "title": f"Preview Song {suffix}"}
        ]
        body = {
            "automation": {
                "name": "preview",
                "source": {"type": "top_tracks", "period": "3m"},
                "output": {"maxSize": 5},
            }
        }
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", return_value=tracks
        ) as mock_enrich:
            first = await client.post("/api/automations/preview", json=body)
            assert first.status_code == 200
            assert first.json()["cache_misses"] == 1
            second = await client.post("/api/automations/preview", json=body)
            assert second.status_code == 200
            assert mock_enrich.call_count == 1
        data = second.json()
        assert data["cache_hits"] == 1
        assert data["cache_misses"] == 0
        assert data["lastfm_calls"] == 0
        # Same tracks back; the warm path carries the full enriched shape
        # (counters defaulted) that the bare mock dicts lack.
        assert [(t["artist"], t["title"]) for t in data["tracks"]] == [
            (tracks[0]["artist"], tracks[0]["title"])
        ]
        assert data["tracks"][0]["listeners"] == 0
        assert data["tracks"][0]["artist_tags"] == []
    finally:
        await _cleanup_user(email=email)
    """An upstream Last.fm failure must return 502 with a generic detail."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        with patch(
            "services.automation_runner.get_top_tracks",
            side_effect=Exception("secret internal traceback"),
        ):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body("top_tracks"),
            )
        assert resp.status_code == 502
        detail = resp.json()["detail"]
        assert detail == "Unable to fetch tracks from Last.fm"
        assert "secret internal traceback" not in detail
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_success_returns_tracks_and_total(client: AsyncClient):
    """A successful preview returns 200 with {tracks, total}."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tracks = [
            {"artist": "Artist A", "title": "Song A"},
            {"artist": "Artist B", "title": "Song B"},
        ]
        with patch("services.automation_runner.get_top_tracks", return_value=tracks), patch(
            "services.enrich_cache.enrich_tracks", return_value=tracks
        ):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body("top_tracks"),
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
            {"artist": "Artist A", "title": "Song A", "userplaycount": 5},
            {"artist": "Artist B", "title": "Song B", "userplaycount": 20},
        ]
        body = {
            "automation": {
                "name": "preview",
                "source": {"type": "top_tracks", "period": "3m"},
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
        with patch("services.automation_runner.get_top_tracks", return_value=tracks), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
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