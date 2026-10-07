"""Tranche 4a: per-group freshness starts with an explicit tags stamp.

tags_fetched_at makes the old "fresh row = fresh tags" pact explicit.
Behavior is unchanged (migration backfills old rows), so these tests pin
the new column: fresh/fresh hits, stale or NULL tags miss and refetch,
and write-back stamps both columns together.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from models.track import Track
from models.user import User
from repositories.tracks import get_track_by_artist_title
from services.automation_runner import run_automation_pipeline_cached
from sqlalchemy import select, update

from .conftest import _TestSessionLocal


def _live_info(artist, title):
    return {
        "artist": artist,
        "title": title,
        "listeners": 10,
        "global_playcount": 20,
        "userplaycount": 5,
        "userloved": True,
        "artist_tags": [{"name": "rock", "count": 100}],
        "album": "Field Album",
        "album_tags": [{"name": "indie", "count": 90}],
    }


def _groups():
    return [{"conditions": [{"field": "listeners", "operator": "gt", "value": 1}]}]


async def _run_once(db, user_id, base, live):
    with (
        patch(
            "services.automation_runner.dispatch_source_tracks",
            return_value=[dict(base)],
        ),
        patch("services.enrich_cache.enrich_tracks", return_value=[live]),
    ):
        return await run_automation_pipeline_cached(
            db,
            user_id=user_id,
            username="u",
            source_type="recent_tracks",
            period="3m",
            filter_groups=_groups(),
            max_tracks=50,
        )


async def _make_user_id(suffix):
    async with _TestSessionLocal() as db:
        user_id = f"u-{suffix}"
        db.add(User(id=user_id))
        await db.commit()
        return user_id


@pytest.mark.asyncio
async def test_write_back_stamps_both_columns():
    """A full fetch stamps core and tags together (the explicit pact)."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _make_user_id(suffix)
    base = {"artist": f"WA {suffix}", "title": f"WT {suffix}"}
    async with _TestSessionLocal() as db:
        await _run_once(db, user_id, base, _live_info(base["artist"], base["title"]))
        await db.commit()
    async with _TestSessionLocal() as db:
        row = await get_track_by_artist_title(db, base["artist"], base["title"])
        assert row is not None
        assert row.last_fetched_at is not None
        assert row.tags_fetched_at is not None


@pytest.mark.asyncio
async def test_stale_tags_force_refetch_then_hit():
    """Fresh core + stale tags misses once, then hits again."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _make_user_id(suffix)
    base = {"artist": f"SA {suffix}", "title": f"ST {suffix}"}
    live = _live_info(base["artist"], base["title"])
    async with _TestSessionLocal() as db:
        await _run_once(db, user_id, base, live)
        await db.commit()
        await db.execute(
            update(Track)
            .where(Track.artist == base["artist"], Track.title == base["title"])
            .values(tags_fetched_at=datetime.now(UTC) - timedelta(hours=25))
        )
        await db.commit()
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch(
                "services.enrich_cache.enrich_tracks", return_value=[live]
            ) as mock_live,
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id=user_id,
                username="u",
                source_type="recent_tracks",
                period="3m",
                filter_groups=_groups(),
                max_tracks=50,
            )
            await db.commit()
        assert mock_live.call_count == 1
        assert result["cache_misses"] == 1
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=AssertionError("should be a full hit"),
            ),
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id=user_id,
                username="u",
                source_type="recent_tracks",
                period="3m",
                filter_groups=_groups(),
                max_tracks=50,
            )
    assert result["cache_hits"] == 1


@pytest.mark.asyncio
async def test_null_tags_always_miss():
    """Rows that never verified tags (NULL stamp) never serve tags."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _make_user_id(suffix)
    base = {"artist": f"NA {suffix}", "title": f"NT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    async with _TestSessionLocal() as db:
        await _run_once(db, user_id, base, live)
        await db.commit()
        await db.execute(
            update(Track)
            .where(Track.artist == base["artist"], Track.title == base["title"])
            .values(tags_fetched_at=None)
        )
        await db.commit()
    async with _TestSessionLocal() as db:
        result = await _run_once(db, user_id, base, live)
        await db.commit()
    assert result["cache_misses"] == 1
    async with _TestSessionLocal() as db:
        row = await get_track_by_artist_title(db, base["artist"], base["title"])
        assert row is not None
        assert row.tags_fetched_at is not None


@pytest.mark.asyncio
async def test_fresh_row_still_serves_without_live_calls():
    """Sanity: a fully fresh row is a full hit (no behavior change)."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _make_user_id(suffix)
    base = {"artist": f"FA {suffix}", "title": f"FT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    async with _TestSessionLocal() as db:
        await _run_once(db, user_id, base, live)
        await db.commit()
    async with _TestSessionLocal() as db:
        before = (
            await db.execute(
                select(Track.last_fetched_at, Track.tags_fetched_at).where(
                    Track.artist == base["artist"], Track.title == base["title"]
                )
            )
        ).one()
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=AssertionError("should be a full hit"),
            ),
        ):
            result = await run_automation_pipeline_cached(
                db,
                user_id=user_id,
                username="u",
                source_type="recent_tracks",
                period="3m",
                filter_groups=_groups(),
                max_tracks=50,
            )
    assert result["cache_hits"] == 1
    assert result["tracks"][0]["artist_tags"] == [{"name": "rock", "count": 100}]
    assert before[0] is not None and before[1] is not None
