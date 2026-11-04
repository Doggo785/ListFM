"""New chain filters and limits: first listen, artist rank, per artist, no repeat."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from filter_types import ArtistRankPeriod
from httpx import AsyncClient
from models.automation import Automation
from models.user import User
from repositories.scrobbles import store_scrobbles
from repositories.tags import mark_artist_tags_fetched, upsert_artist_tag
from services.automation_runner import (
    apply_limits,
    run_automation,
    run_automation_pipeline_cached,
)

from .conftest import _TestSessionLocal, _unique_email
from .test_automation_filters import _frontend_payload, _register_login_link

NOW = datetime(2026, 3, 31, 12, tzinfo=UTC)


async def _user(listens):
    """listens: (title, artist, days before NOW)."""
    user_id = str(uuid.uuid4())
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email(), scrobbles_complete_at=NOW))
        await db.flush()
        await store_scrobbles(db, user_id, [(t, a, NOW - timedelta(days=d)) for t, a, d in listens])
        await db.commit()
    return user_id


async def _titles(user_id, condition=None, window=None, **limits):
    groups = [{"id": "g", "conditions": [{"id": "c", **condition}]}] if condition else []
    async with _TestSessionLocal() as db:
        result = await run_automation_pipeline_cached(
            db, user_id=user_id, username="u", window=window or {"length": None}, sort="most_played",
            filter_groups=groups, max_tracks=limits.pop("max_tracks", 10), at=NOW, **limits,
        )
    return [t["title"] for t in result["tracks"]]


@pytest.mark.asyncio
async def test_first_listen_filter_counts_from_the_run_date():
    user_id = await _user([("New", "A", 5), ("Old", "A", 5), ("Old", "A", 100)])
    discovered = {"field": "first_played", "operator": "within_days", "value": 30}
    assert await _titles(user_id, discovered) == ["New"]
    long_known = {"field": "first_played", "operator": "before", "value": 30}
    assert await _titles(user_id, long_known) == ["Old"]


@pytest.mark.asyncio
async def test_artist_rank_defaults_to_the_window_and_accepts_other_periods():
    # All time: Past leads. Last month: Now leads, Past is absent.
    user_id = await _user(
        [("p1", "Past", 400), ("p2", "Past", 401), ("p3", "Past", 402), ("n1", "Now", 5), ("n2", "Now", 6)]
    )
    top_one = {"field": "artist_rank", "operator": "lte", "value": 1}
    one_month = {"length": {"amount": 1, "unit": "month"}}

    assert set(await _titles(user_id, top_one, window=one_month)) == {"n1", "n2"}
    assert set(await _titles(user_id, top_one)) == {"p1", "p2", "p3"}
    # Listening over the last month, keeping only the all-time top artist: nobody.
    all_time = {**top_one, "period": {"length": None}}
    assert await _titles(user_id, all_time, window=one_month) == []
    # Fixed dates rank on that period, whatever the window reads.
    fixed = {**top_one, "period": {"since": "2025-01-01", "until": "2025-12-31"}}
    assert set(await _titles(user_id, fixed)) == {"p1", "p2", "p3"}
    outside = {**top_one, "period": {"since": "2010-01-01", "until": "2010-12-31"}}
    assert await _titles(user_id, outside) == []


@pytest.mark.parametrize(
    "period",
    [
        {"since": "2020-01-01"},
        {"until": "2020-01-01"},
        {"since": "2021-01-01", "until": "2020-01-01"},
        {"since": "2020-01-01", "until": "2020-02-01", "length": {"amount": 1, "unit": "day"}},
    ],
)
def test_invalid_periods_are_refused(period):
    with pytest.raises(ValueError):
        ArtistRankPeriod.model_validate(period)


def test_limits_keep_the_sort_order():
    tracks = [{"title": t, "artist": a} for t, a in (("a1", "A"), ("a2", "A"), ("b1", "B"), ("a3", "A"), ("b2", "B"))]
    def titles(*args):
        return [t["title"] for t in apply_limits(tracks, *args)]
    assert titles(10, 1) == ["a1", "b1"]
    assert titles(3, 2) == ["a1", "a2", "b1"]
    assert titles(2, None, None, {("a1", "A")}) == ["a2", "b1"]


def test_album_limit_counts_per_artist_and_ignores_unknown_albums():
    tracks = [
        {"title": "x1", "artist": "X", "album": "Hits"},
        {"title": "x2", "artist": "X", "album": "Hits"},
        {"title": "y1", "artist": "Y", "album": "Hits"},
        {"title": "x3", "artist": "X", "album": None},
        {"title": "x4", "artist": "X", "album": None},
    ]
    kept = apply_limits(tracks, 10, max_per_album=1)
    assert [t["title"] for t in kept] == ["x1", "y1", "x3", "x4"]


@pytest.mark.asyncio
async def test_no_repeat_skips_the_last_playlists_only():
    user_id = await _user([("One", "A", 1), ("One", "A", 2), ("Two", "A", 1)])
    automation = Automation(
        id=str(uuid.uuid4()), user_id=user_id, lastfm_username="u", name="t", window={"length": None},
        sort="most_played", filter_groups=[], output_max_size=1, output_no_repeat_playlists=1, enabled=True,
    )
    other = Automation(
        id=str(uuid.uuid4()), user_id=user_id, lastfm_username="u", name="o", window={"length": None},
        sort="most_played", filter_groups=[], output_max_size=2, output_no_repeat_playlists=5, enabled=True,
    )
    async with _TestSessionLocal() as db:
        db.add_all([automation, other])
        await db.commit()

    async def run(target):
        async with _TestSessionLocal() as db:
            merged = await db.merge(target)
            history = await run_automation(db, merged, scheduled_for=NOW)
            await db.commit()
            return history.status, history.tracks_generated

    async def next_up():
        return await _titles(user_id, automation_id=automation.id, no_repeat_playlists=1, max_tracks=1)

    assert await run(automation) == ("completed", 1)
    assert await next_up() == ["Two"]
    assert await run(automation) == ("completed", 1)
    # Only the previous playlist counts, so the first track comes back.
    assert await next_up() == ["One"]

    # Another automation's playlists do not count; its own emptied list is an empty run.
    assert await run(other) == ("completed", 2)
    assert await run(other) == ("empty", 0)

    # Another user cannot read this automation's tracks through a preview id.
    stranger = await _user([("One", "A", 1)])
    assert await _titles(stranger, automation_id=automation.id, no_repeat_playlists=5) == ["One"]


@pytest.mark.asyncio
async def test_api_round_trips_limits_and_periods_and_bounds_the_depth(client: AsyncClient):
    await _register_login_link(client, _unique_email())
    condition = {
        "id": "c", "field": "artist_rank", "operator": "lte", "value": 20,
        "period": {"since": "2019-01-01", "until": "2019-12-31"},
    }
    body = _frontend_payload([{"id": "g", "logic": "AND", "conditions": [condition], "groups": []}])
    body["output"] = {"maxSize": 20, "maxPerArtist": 2, "maxPerAlbum": 1, "noRepeatPlaylists": 3}
    created = await client.post("/api/automations", json=body)
    assert created.status_code == 201, created.text
    read = created.json()
    assert read["output"] == body["output"]
    assert read["filterGroups"][0]["conditions"][0]["period"]["since"] == "2019-01-01"

    # A partial output keeps the limits it does not mention.
    patched = await client.patch(f"/api/automations/{read['id']}", json={"output": {"maxSize": 30}})
    assert patched.json()["output"] == {"maxSize": 30, "maxPerArtist": 2, "maxPerAlbum": 1, "noRepeatPlaylists": 3}

    def group(*subs):
        return {"id": str(uuid.uuid4()), "conditions": [], "groups": list(subs)}

    assert (await client.post("/api/automations", json=_frontend_payload([group(group())]))).status_code == 201
    too_deep = [group(group(group()))]
    assert (await client.post("/api/automations", json=_frontend_payload(too_deep))).status_code == 422
    patched = await client.patch(f"/api/automations/{read['id']}", json={"filterGroups": too_deep})
    assert patched.status_code == 422


@pytest.mark.asyncio
async def test_fixed_dates_are_read_in_the_users_timezone():
    # December 31 at 23:30 UTC is already January 1 in Paris.
    played = datetime(2025, 12, 31, 23, 30, tzinfo=UTC)
    user_id = str(uuid.uuid4())
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email(), timezone="Europe/Paris", scrobbles_complete_at=NOW))
        await db.flush()
        await store_scrobbles(db, user_id, [("Late", "A", played)])
        await db.commit()
    rank = {"field": "artist_rank", "operator": "lte", "value": 1}
    in_2025 = {**rank, "period": {"since": "2025-01-01", "until": "2025-12-31"}}
    in_2026 = {**rank, "period": {"since": "2026-01-01", "until": "2026-12-31"}}
    assert await _titles(user_id, in_2025) == []
    assert await _titles(user_id, in_2026) == ["Late"]


@pytest.mark.asyncio
async def test_pipeline_counts_each_stage_and_known_tags():
    user_id = await _user(
        [("r1", "Rock", 1), ("r2", "Rock", 1), ("b1", "Bare", 1), ("u1", "Unknown", 1)]
    )
    async with _TestSessionLocal() as db:
        await upsert_artist_tag(db, "Rock", "rock", 100)
        await mark_artist_tags_fetched(db, {"Rock", "Bare"})
        await db.commit()
        result = await run_automation_pipeline_cached(
            db, user_id=user_id, username="u", window={"length": None}, sort="most_played",
            filter_groups=[{"id": "g", "conditions": [
                {"id": "c", "field": "tags", "operator": "contains", "value": "rock"},
            ]}],
            max_tracks=1, at=NOW,
        )
    assert (result["before_filter"], result["after_filter"], result["total"]) == (4, 2, 1)
    assert (result["known_tag_artists"], result["window_artists"]) == (2, 3)
