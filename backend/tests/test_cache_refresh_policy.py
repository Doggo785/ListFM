"""Tranche 4b: differentiated freshness kills the 24h cliff.

Global data (core, tags) lives 7d; personal data refreshes only where it
could have changed (replayed since verify, loved on its own 7d clock),
with a 30d safety net. Each test below crafts one exact row state and pins
the verdict — including the documented compromise (week-old globals served)
and a REAL hole for the safety net (not just an old clock).
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from models.track import Track
from models.user import User
from models.user_track import UserTrack
from services.automation_runner import run_automation_pipeline_cached
from sqlalchemy import delete, select, update

from .conftest import _TestSessionLocal


def _live_info(artist, title, playcount=5):
    return {
        "artist": artist,
        "title": title,
        "listeners": 10,
        "global_playcount": 20,
        "userplaycount": playcount,
        "userloved": True,
        "artist_tags": [{"name": "rock", "count": 100}],
        "album": "Policy Album",
        "album_tags": [{"name": "indie", "count": 90}],
    }


def _groups():
    return [{"conditions": [{"field": "listeners", "operator": "gt", "value": 1}]}]


async def _new_user(suffix):
    async with _TestSessionLocal() as db:
        user_id = f"u-{suffix}"
        db.add(User(id=user_id))
        await db.commit()
        return user_id


async def _warm(base, live, user_id):
    """One full run: all stamps fresh. Returns (artist, title)."""
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]),
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
    assert result["cache_misses"] == 1
    return base["artist"], base["title"]


async def _age_track(artist, title, **columns):
    async with _TestSessionLocal() as db:
        await db.execute(
            update(Track).where(Track.artist == artist, Track.title == title).values(**columns)
        )
        await db.commit()


async def _age_user_track(user_id, artist, title, **columns):
    async with _TestSessionLocal() as db:
        track_id = (
            await db.execute(
                select(Track.id).where(Track.artist == artist, Track.title == title)
            )
        ).scalar_one()
        await db.execute(
            update(UserTrack)
            .where(UserTrack.user_id == user_id, UserTrack.track_id == track_id)
            .values(**columns)
        )
        await db.commit()


async def _run_hit_or_miss(user_id, base, live):
    """Run with a live layer that explodes: hits pass, misses raise."""
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=AssertionError("should have been a hit"),
            ),
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


@pytest.mark.asyncio
async def test_week_old_globals_still_served():
    """Documented compromise: 3d-old core+tags are served as-is."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"GA {suffix}", "title": f"GT {suffix}"}
    await _warm(base, _live_info(base["artist"], base["title"]), user_id)
    aged = datetime.now(UTC) - timedelta(days=3)
    await _age_track(base["artist"], base["title"], last_fetched_at=aged, tags_fetched_at=aged)
    result = await _run_hit_or_miss(user_id, base, None)
    assert result["cache_hits"] == 1
    assert result["tracks"][0]["listeners"] == 10


@pytest.mark.asyncio
async def test_eight_day_old_globals_miss():
    """Past 7d, globals refetch (pins the boundary explicitly)."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"BA {suffix}", "title": f"BT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    await _warm(base, live, user_id)
    aged = datetime.now(UTC) - timedelta(days=8)
    await _age_track(base["artist"], base["title"], last_fetched_at=aged, tags_fetched_at=aged)
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]),
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
    assert result["cache_misses"] == 1


@pytest.mark.asyncio
async def test_unreplayed_personal_data_served():
    """No replay since verify + loved fresh: user data exact, no call."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"UA {suffix}", "title": f"UT {suffix}"}
    await _warm(base, _live_info(base["artist"], base["title"]), user_id)
    now = datetime.now(UTC)
    await _age_user_track(
        user_id,
        base["artist"],
        base["title"],
        last_synced_at=now - timedelta(days=3),
        last_played_at=now - timedelta(days=4),
    )
    result = await _run_hit_or_miss(user_id, base, None)
    assert result["cache_hits"] == 1
    assert result["tracks"][0]["userplaycount"] == 5


@pytest.mark.asyncio
async def test_replayed_track_refreshes():
    """Played since verify: refetch, served values corrected."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"RA {suffix}", "title": f"RT {suffix}"}
    await _warm(base, _live_info(base["artist"], base["title"]), user_id)
    now = datetime.now(UTC)
    await _age_user_track(
        user_id,
        base["artist"],
        base["title"],
        last_synced_at=now - timedelta(days=3),
        last_played_at=now,
    )
    live = _live_info(base["artist"], base["title"], playcount=99)
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]) as mock_live,
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
    assert result["tracks"][0]["userplaycount"] == 99


@pytest.mark.asyncio
async def test_stale_loved_forces_refetch():
    """Loved older than 7d refetches even with nothing replayed."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"LA {suffix}", "title": f"LT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    await _warm(base, live, user_id)
    now = datetime.now(UTC)
    await _age_user_track(
        user_id,
        base["artist"],
        base["title"],
        last_synced_at=now - timedelta(days=10),
        last_played_at=now - timedelta(days=11),
    )
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]) as mock_live,
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
    assert mock_live.call_count == 1
    assert result["cache_misses"] == 1


@pytest.mark.asyncio
async def test_safety_net_catches_real_hole():
    """31d-old sync + stale play signal + wrong cached value: refetch fixes it.

    This simulates a true invalidation hole (a replay the sync never saw,
    so last_played_at claims 'not replayed'), not just an old clock: the
    cached playcount is wrong and only the 30d net can catch it.
    """
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"HA {suffix}", "title": f"HT {suffix}"}
    await _warm(base, _live_info(base["artist"], base["title"]), user_id)
    now = datetime.now(UTC)
    async with _TestSessionLocal() as db:
        track_id = (
            await db.execute(
                select(Track.id).where(
                    Track.artist == base["artist"], Track.title == base["title"]
                )
            )
        ).scalar_one()
        await db.execute(
            update(UserTrack)
            .where(UserTrack.user_id == user_id, UserTrack.track_id == track_id)
            .values(
                last_synced_at=now - timedelta(days=31),
                last_played_at=now - timedelta(days=40),
                user_playcount=1,
            )
        )
        await db.commit()
    live = _live_info(base["artist"], base["title"], playcount=99)
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]),
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
    assert result["cache_misses"] == 1
    assert result["tracks"][0]["userplaycount"] == 99


@pytest.mark.asyncio
async def test_unknown_last_play_never_trusted():
    """NULL last_played_at past 24h always refetches."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"PA {suffix}", "title": f"PT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    await _warm(base, live, user_id)
    now = datetime.now(UTC)
    await _age_user_track(
        user_id,
        base["artist"],
        base["title"],
        last_synced_at=now - timedelta(days=3),
        last_played_at=None,
    )
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]) as mock_live,
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
    assert mock_live.call_count == 1
    assert result["cache_misses"] == 1


@pytest.mark.asyncio
async def test_missing_user_row_misses():
    """No user row at all: full fetch, like before."""
    suffix = uuid.uuid4().hex[:8]
    user_id = await _new_user(suffix)
    base = {"artist": f"MA {suffix}", "title": f"MT {suffix}"}
    live = _live_info(base["artist"], base["title"])
    await _warm(base, live, user_id)
    async with _TestSessionLocal() as db:
        track_id = (
            await db.execute(
                select(Track.id).where(
                    Track.artist == base["artist"], Track.title == base["title"]
                )
            )
        ).scalar_one()
        await db.execute(
            delete(UserTrack).where(
                UserTrack.user_id == user_id, UserTrack.track_id == track_id
            )
        )
        await db.commit()
    async with _TestSessionLocal() as db:
        with (
            patch(
                "services.automation_runner.dispatch_source_tracks",
                return_value=[dict(base)],
            ),
            patch("services.enrich_cache.enrich_tracks", return_value=[live]),
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
    assert result["cache_misses"] == 1
