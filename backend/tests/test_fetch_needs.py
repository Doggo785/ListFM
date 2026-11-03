"""Tranche 1: fetch-only-what-filters-need.

``needed_fields`` maps a filter tree to the enrich keys it actually reads;
the live layer fetches only those keys; a partial fetch never writes back
so the read path's "fresh row = complete row" pact holds until per-group
freshness lands (tranche 4).
"""

import uuid
from unittest.mock import patch

import pytest
from filter_types import FilterCondition, FilterGroup
from models.user import User
from repositories.tracks import get_track_by_artist_title
from services import lastfm
from services.automation_runner import (
    FULL_FETCH_KEYS,
    needed_fields,
    run_automation_pipeline_cached,
)
from services.lastfm import (
    enrich_tracks,
    get_lastfm_call_count,
    reset_lastfm_call_count,
)

from .conftest import _TestSessionLocal


def _cond(field):
    return {"field": field, "operator": "gt", "value": 1}


def _live_info():
    return {
        "listeners": 10,
        "global_playcount": 20,
        "userplaycount": 5,
        "userloved": True,
        "artist_tags": [{"name": "rock", "count": 100}],
        "album": "Cached Album",
        "album_tags": [{"name": "indie", "count": 90}],
    }


def test_needed_fields_empty():
    assert needed_fields(None) == set()
    assert needed_fields([]) == set()
    assert needed_fields([{"conditions": []}]) == set()


def test_needed_fields_dispatch_only():
    """playcount/rank/timestamp come from dispatch: no enrich needed."""
    groups = [{"conditions": [_cond("playcount"), _cond("rank"), _cond("timestamp")]}]
    assert needed_fields(groups) == set()


def test_needed_fields_each_mapping():
    # Read from the stored listens: no enrichment.
    assert needed_fields([{"conditions": [_cond("userplaycount")]}]) == set()
    assert needed_fields([{"conditions": [_cond("userloved")]}]) == set()
    assert needed_fields([{"conditions": [_cond("global_playcount")]}]) == {
        "global_playcount"
    }
    assert needed_fields([{"conditions": [_cond("listeners")]}]) == {"listeners"}
    assert needed_fields([{"conditions": [_cond("tags")]}]) == {
        "artist_tags",
        "album",
        "album_tags",
    }


def test_needed_fields_nested_groups_and_models():
    """Nested groups accumulate; Pydantic models work like dicts (runtime shape)."""
    inner = FilterGroup(
        id="g2",
        logic="OR",
        conditions=[
            FilterCondition(id="c2", field="listeners", operator="gt", value=5),
        ],
    )
    outer = FilterGroup(
        id="g1",
        conditions=[
            FilterCondition(id="c1", field="userloved", operator="is", value=True),
        ],
        groups=[inner],
    )
    assert needed_fields([outer]) == {"listeners"}


def test_needed_fields_unknown_field_falls_back_full():
    """Unknown field: fetch everything rather than filter on defaults."""
    assert needed_fields([{"conditions": [_cond("mystery")]}]) == set(FULL_FETCH_KEYS)


def test_needed_fields_all_keys_short_circuits():
    """Conditions spanning every key return the full set directly."""
    groups = [
        {
            "conditions": [
                _cond("tags"),
                _cond("userplaycount"),
                _cond("userloved"),
                _cond("global_playcount"),
                _cond("listeners"),
            ]
        }
    ]
    assert needed_fields(groups) == set(FULL_FETCH_KEYS)


_INFO = {
    "listeners": "11",
    "playcount": "22",
    "userplaycount": "3",
    "userloved": "1",
    "album": {"title": "Alb"},
}


def test_enrich_tracks_only_skips_unneeded_calls():
    """only={"listeners"} performs exactly one live call per track."""
    tracks = [{"artist": "A", "title": "one"}]
    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm._track_info", return_value=_INFO) as info,
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
    ):
        reset_lastfm_call_count()
        out = enrich_tracks("user", tracks, only={"listeners"})
    assert info.call_count == 1
    assert get_lastfm_call_count() == 1
    assert out[0]["listeners"] == 11
    assert out[0]["artist_tags"] == []
    assert out[0]["album_tags"] == []


def test_enrich_tracks_full_by_default():
    """only=None: one track.getInfo serves every track-level field."""
    tracks = [{"artist": "A", "title": "one"}]
    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm._track_info", return_value=_INFO) as info,
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
    ):
        out = enrich_tracks("user", tracks)
    assert info.call_count == 1
    assert out[0]["listeners"] == 11
    assert out[0]["global_playcount"] == 22
    assert out[0]["userplaycount"] == 3
    assert out[0]["userloved"] is True
    assert out[0]["album"] == "Alb"


def test_enrich_tracks_only_survives_live_failures():
    """Album tag lookup failing keeps the rest of the track."""
    tracks = [{"artist": "A", "title": "one"}]
    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm._track_info", return_value=_INFO),
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
    ):
        out = enrich_tracks("user", tracks)
    assert out[0]["listeners"] == 11
    assert out[0]["artist_tags"] == []
    assert out[0]["album"] == "Alb"
    assert out[0]["album_tags"] == []
    assert out[0]["fetch_failed"] is True


@pytest.mark.asyncio
async def test_loved_only_filter_skips_enrich_on_extended_tracks():
    """extended=1 loved flags make the live layer unnecessary for loved filters."""
    tracks = [
        {"title": "loved", "artist": "a", "userloved": True},
        {"title": "meh", "artist": "a", "userloved": False},
    ]
    groups = [
        {"conditions": [{"field": "userloved", "operator": "is", "value": True}]}
    ]
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.get_window_tracks", return_value=tracks
            ),
            patch("services.automation_runner.enrich_tracks_cached") as mock_cached,
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id="u1",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=groups,
                max_tracks=50,
            )
    mock_cached.assert_not_called()
    assert [t["title"] for t in result["tracks"]] == ["loved"]


def test_merge_preserves_dispatch_loved_over_enrich_defaults():
    """A dispatch-known loved=True survives the enrich merge."""
    tracks = [{"artist": "A", "title": "one", "userloved": True}]
    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch(
            "services.lastfm.get_track_full_info",
            return_value={"listeners": 7, "userloved": False},
        ),
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
    ):
        out = enrich_tracks("user", tracks)
    assert out[0]["listeners"] == 7
    assert out[0]["userloved"] is True


@pytest.mark.asyncio
async def test_cached_pipeline_empty_filters_writes_nothing():
    """Empty filters: no enrich call and no track row in DB."""
    suffix = uuid.uuid4().hex[:8]
    tracks = [{"title": f"T {suffix}", "artist": f"A {suffix}"}]
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.get_window_tracks",
                return_value=tracks,
            ),
            patch("services.automation_runner.enrich_tracks_cached") as mock_cached,
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id="u1",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=[],
                max_tracks=50,
            )
            await db.commit()
        mock_cached.assert_not_called()
    assert result["total"] == 1
    async with _TestSessionLocal() as db:
        assert await get_track_by_artist_title(db, f"A {suffix}", f"T {suffix}") is None


@pytest.mark.asyncio
async def test_write_back_stores_dispatch_image():
    """Extended dispatch images persist on track rows for future UI."""
    suffix = uuid.uuid4().hex[:8]
    base = {
        "artist": f"IA {suffix}",
        "title": f"IT {suffix}",
        "image": "http://img/174/x.png",
    }
    live = [{**base, **_live_info()}]
    groups = [{"conditions": [_cond("listeners")]}]
    async with _TestSessionLocal() as db:
        db.add(User(id=f"u-{suffix}"))
        await db.commit()
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.get_window_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=live),
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id=f"u-{suffix}",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=groups,
                max_tracks=50,
            )
            await db.commit()
    assert result["total"] == 1
    async with _TestSessionLocal() as db:
        row = await get_track_by_artist_title(db, base["artist"], base["title"])
        assert row is not None
        assert row.image_url == "http://img/174/x.png"


@pytest.mark.asyncio
async def test_cached_pipeline_nonempty_needs_still_warms_cache():
    """Non-empty needs run the full fetch + write-back, like before.

    Warming stays intact for repeated runs; only the empty-needs path
    skips the live layer. (Per-group warming arrives with per-group
    freshness in a later tranche.)
    """
    groups = [{"conditions": [_cond("listeners")]}]
    suffix = uuid.uuid4().hex[:8]
    base = {"artist": f"A {suffix}", "title": f"T {suffix}"}
    live = [{**base, **_live_info()}]
    async with _TestSessionLocal() as db:
        db.add(User(id="u1"))
        await db.commit()
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.get_window_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=live),
        ):
            first = await run_automation_pipeline_cached(
                db,
                user_id="u1",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=groups,
                max_tracks=50,
            )
            await db.commit()
            second = await run_automation_pipeline_cached(
                db,
                user_id="u1",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=groups,
                max_tracks=50,
            )
    assert first["cache_misses"] == 1
    assert second["cache_hits"] == 1
    assert second["lastfm_calls"] == 0
