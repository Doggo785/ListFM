"""Window -> sort -> filter -> size, read from the stored listens (ADR 0002)."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pylast
import pytest
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.user import User
from repositories.scrobbles import get_window_tracks, replace_loved, store_scrobbles
from repositories.tags import mark_artist_tags_fetched, upsert_artist_tag
from services import automation_runner
from services.automation_runner import (
    HistoryLoading,
    _sync_before_run,
    run_automation,
    run_automation_pipeline_cached,
    sort_tracks,
    window_bounds,
)
from sqlalchemy import select

from .conftest import _TestSessionLocal, _unique_email

NOW = datetime(2026, 3, 31, 12, tzinfo=UTC)


def test_window_bounds():
    three_months = {"length": {"amount": 3, "unit": "month"}}
    assert window_bounds(three_months, NOW) == (datetime(2025, 12, 31, 12, tzinfo=UTC), NOW)
    # Month arithmetic clamps to the last day: March 31 minus one month.
    one_month = {"length": {"amount": 1, "unit": "month"}}
    assert window_bounds(one_month, NOW)[0] == datetime(2026, 2, 28, 12, tzinfo=UTC)
    same_month_last_year = {"length": {"amount": 1, "unit": "month"}, "ago": {"amount": 1, "unit": "year"}}
    assert window_bounds(same_month_last_year, NOW) == (
        datetime(2025, 2, 28, 12, tzinfo=UTC),
        datetime(2025, 3, 31, 12, tzinfo=UTC),
    )
    assert window_bounds({"length": {"amount": 2, "unit": "week"}}, NOW)[0] == NOW - timedelta(days=14)
    assert window_bounds({"length": None}, NOW) == (None, NOW)


def test_sorts():
    tracks = [
        {"title": "a", "playcount": 1, "timestamp": 30, "first_played": 5},
        {"title": "b", "playcount": 9, "timestamp": 10, "first_played": 1},
        {"title": "c", "playcount": 5, "timestamp": 20, "first_played": 9},
    ]
    order = {sort: [t["title"] for t in sort_tracks(tracks, sort)] for sort in ("most_played", "last_played", "first_played")}
    assert order == {"most_played": ["b", "c", "a"], "last_played": ["a", "c", "b"], "first_played": ["c", "a", "b"]}
    for sort in ("random", "random_weighted"):
        assert sorted(t["title"] for t in sort_tracks(tracks, sort)) == ["a", "b", "c"]


async def _user_with_listens(listens, loved=()):
    """listens: (title, days before NOW); loved: titles."""
    user_id = str(uuid.uuid4())
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email(), scrobbles_complete_at=NOW))
        await db.flush()
        await store_scrobbles(db, user_id, [(title, "Artist", NOW - timedelta(days=days)) for title, days in listens])
        if loved:
            await replace_loved(db, user_id, [(title, "Artist") for title in loved])
        await db.commit()
    return user_id


@pytest.mark.asyncio
async def test_window_tracks_count_inside_and_outside_the_window():
    user_id = await _user_with_listens([("Old", 400), ("Old", 10), ("Old", 5), ("New", 2), ("Gone", 200)], loved=["New"])
    start, end = window_bounds({"length": {"amount": 1, "unit": "month"}}, NOW)
    async with _TestSessionLocal() as db:
        rows = {t["title"]: t for t in await get_window_tracks(db, user_id, start, end)}
    assert set(rows) == {"Old", "New"}
    assert (rows["Old"]["playcount"], rows["Old"]["userplaycount"]) == (2, 3)
    assert rows["Old"]["first_played"] == int((NOW - timedelta(days=400)).timestamp())
    assert rows["Old"]["timestamp"] == int((NOW - timedelta(days=5)).timestamp())
    assert (rows["New"]["userloved"], rows["Old"]["userloved"]) == (True, False)


@pytest.mark.asyncio
async def test_pipeline_sorts_filters_and_cuts_to_size():
    user_id = await _user_with_listens([("A", 1), ("B", 1), ("B", 2), ("C", 1), ("C", 2), ("C", 3)])
    played_twice = [{"conditions": [{"field": "playcount", "operator": "gte", "value": 2}]}]
    async with _TestSessionLocal() as db:
        result = await run_automation_pipeline_cached(
            db, user_id=user_id, username="u", window={"length": None}, sort="most_played",
            filter_groups=played_twice, max_tracks=1, at=NOW,
        )
    assert [t["title"] for t in result["tracks"]] == ["C"]
    assert (result["before_filter"], result["total"]) == (3, 1)




@pytest.mark.asyncio
async def test_filters_read_stored_data_only():
    user_id = await _user_with_listens([("Known", 1), ("Bare", 1), ("Unknown", 1)])
    async with _TestSessionLocal() as db:
        for title, artist in (("Known", "Rockers"), ("Bare", "Tagless"), ("Unknown", "Stranger")):
            await store_scrobbles(db, user_id, [(title, artist, NOW - timedelta(days=2))])
        await upsert_artist_tag(db, "Rockers", "rock", 80)
        await mark_artist_tags_fetched(db, {"Rockers", "Tagless"})
        await db.commit()

    async def titles(condition):
        async with _TestSessionLocal() as db:
            result = await run_automation_pipeline_cached(
                db, user_id=user_id, username="u", window={"length": None}, sort="most_played",
                filter_groups=[{"conditions": [condition]}], max_tracks=10, at=NOW,
            )
        return {(t["artist"]) for t in result["tracks"]}

    with patch("httpx.get", side_effect=AssertionError("no Last.fm call")):
        assert await titles({"field": "tags", "operator": "contains", "value": "rock"}) == {"Rockers"}
        # Tagless is known to have no tag; Stranger and Artist were never looked up.
        assert await titles({"field": "tags", "operator": "not_contains", "value": "rock"}) == {"Tagless"}


async def _automation(user_id):
    automation = Automation(
        id=str(uuid.uuid4()), user_id=user_id, lastfm_username="u", name="t",
        window={"length": {"amount": 7, "unit": "day"}}, sort="most_played",
        filter_groups=[], output_max_size=50, enabled=True,
    )
    async with _TestSessionLocal() as db:
        db.add(automation)
        await db.commit()
    return automation


@pytest.mark.asyncio
async def test_run_with_no_listens_in_window_is_empty_not_failed():
    user_id = await _user_with_listens([("Ancient", 300)])
    automation = await _automation(user_id)
    async with _TestSessionLocal() as db:
        history = await run_automation(db, automation, scheduled_for=NOW)
        await db.commit()
        row = (await db.execute(select(AutomationHistory).where(AutomationHistory.id == history.id))).scalar_one()
    assert (row.status, row.generated_playlist_id, row.tracks_generated) == ("empty", None, 0)


@pytest.mark.asyncio
async def test_run_waits_for_the_first_full_sync():
    user_id = str(uuid.uuid4())
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email()))
        await db.commit()
    automation = await _automation(user_id)
    with patch.object(automation_runner, "start_scrobble_sync") as start:
        async with _TestSessionLocal() as db:
            with pytest.raises(HistoryLoading):
                await _sync_before_run(db, automation)
    start.assert_called_once_with(user_id, "u")
    assert "still loading" in automation_runner._public_error(HistoryLoading())


@pytest.mark.asyncio
async def test_run_syncs_first_and_survives_a_sync_failure():
    user_id = await _user_with_listens([])
    automation = await _automation(user_id)
    for outcome in (None, pylast.WSError(None, "8", "down")):
        sync = AsyncMock(side_effect=outcome)
        with patch.object(automation_runner, "sync_scrobbles", sync):
            async with _TestSessionLocal() as db:
                await _sync_before_run(db, automation)
        sync.assert_awaited_once()

    with (
        patch.object(automation_runner, "is_syncing", return_value=True),
        patch.object(automation_runner, "sync_scrobbles") as sync,
    ):
        async with _TestSessionLocal() as db:
            await _sync_before_run(db, automation)
    sync.assert_not_called()

