"""Tag catalogue (ADR 0003): which artists, in what order, and how failures behave."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pylast
import pytest
from models.artist import Artist
from models.artist_tag import ArtistTag
from models.tag import Tag
from models.user import User
from repositories.scrobbles import (
    get_known_artist_tags,
    get_known_tags,
    store_scrobbles,
)
from repositories.tags import (
    mark_artist_tags_fetched,
    replace_artist_tags,
    upsert_artist_tag,
)
from services import lastfm, scrobble_sync, tag_catalogue
from services.progress import store as progress_store
from services.tag_catalogue import (
    MAX_CONSECUTIVE_FAILURES,
    TAG_VALIDITY,
    fill_tag_catalogue,
)
from sqlalchemy import select, update

from .conftest import _register_and_login, _TestSessionLocal, _unique_email

NOW = datetime.now(UTC)


def _name(label="artist"):
    """The catalogue is shared and survives between tests: never reuse a name."""
    return f"{label}-{uuid.uuid4()}"


async def _user_listening_to(*artists):
    """Each artist gets as many listens as their rank from the end: first is most listened."""
    user_id = str(uuid.uuid4())
    listens = []
    for rank, artist in enumerate(reversed(artists), start=1):
        listens += [(f"t{n}", artist, NOW - timedelta(days=n + 1)) for n in range(rank)]
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email()))
        await db.flush()
        await store_scrobbles(db, user_id, listens)
        await db.commit()
    return user_id


async def _fill(user_id, tags_of):
    """Run a pass with get_artist_tags replaced; returns the artists asked for, in order."""
    asked = []

    def fake(artist):
        asked.append(artist)
        return tags_of(artist)

    with patch.object(tag_catalogue, "get_artist_tags", fake):
        async with _TestSessionLocal() as db:
            await fill_tag_catalogue(db, user_id, "someone")
    return asked


async def _known(user_id):
    async with _TestSessionLocal() as db:
        return await get_known_artist_tags(db, user_id)


@pytest.mark.asyncio
async def test_most_listened_artists_come_first_and_tags_are_stored():
    top, mid, low = _name("top"), _name("mid"), _name("low")
    user_id = await _user_listening_to(top, mid, low)
    asked = await _fill(user_id, lambda artist: [{"name": "rock", "count": 80}] if artist == top else [])
    assert asked == [top, mid, low]
    # An artist Last.fm has no tags for is known, not unknown.
    assert await _known(user_id) == {top: [{"name": "rock", "count": 80}], mid: [], low: []}
    assert await _fill(user_id, lambda artist: []) == []


@pytest.mark.asyncio
async def test_catalogue_is_shared_between_users():
    shared = _name()
    first, second = await _user_listening_to(shared), await _user_listening_to(shared)
    await _fill(first, lambda artist: [])
    assert await _fill(second, lambda artist: []) == []


@pytest.mark.asyncio
async def test_expired_tags_are_refetched_and_replaced():
    artist = _name()
    user_id = await _user_listening_to(artist)
    await _fill(user_id, lambda a: [{"name": "dropped", "count": 50}])

    async with _TestSessionLocal() as db:
        await db.execute(
            update(Artist)
            .where(Artist.name == artist)
            .values(tags_fetched_at=NOW - TAG_VALIDITY + timedelta(days=1))
        )
        await db.commit()
    assert await _fill(user_id, lambda a: []) == []  # still valid

    async with _TestSessionLocal() as db:
        await db.execute(
            update(Artist)
            .where(Artist.name == artist)
            .values(tags_fetched_at=NOW - TAG_VALIDITY - timedelta(days=1))
        )
        await db.commit()
    assert await _fill(user_id, lambda a: [{"name": "kept", "count": 90}]) == [artist]
    assert await _known(user_id) == {artist: [{"name": "kept", "count": 90}]}


@pytest.mark.asyncio
async def test_artist_fetched_by_another_pass_is_not_asked_again():
    first, second = _name("first"), _name("second")
    user_id = await _user_listening_to(first, second)

    asked = []

    async def racing_call(fn, artist):
        asked.append(artist)
        async with _TestSessionLocal() as other:
            await mark_artist_tags_fetched(other, {second})
            await other.commit()
        return []

    with patch.object(tag_catalogue, "call_retrying_rate_limit", racing_call):
        async with _TestSessionLocal() as db:
            await fill_tag_catalogue(db, user_id, "someone")
    assert asked == [first]


@pytest.mark.asyncio
async def test_failed_artist_stays_unknown_and_the_pass_continues():
    bad, good = _name("bad"), _name("good")
    user_id = await _user_listening_to(bad, good)

    def tags_of(artist):
        if artist == bad:
            raise pylast.WSError(None, "8", "Operation failed")
        return []

    assert await _fill(user_id, tags_of) == [bad, good]
    assert await _known(user_id) == {good: []}
    # Unknown means due: the next sync tries it again.
    assert await _fill(user_id, lambda artist: []) == [bad]


@pytest.mark.asyncio
async def test_pass_stops_when_last_fm_is_down():
    artists = [_name() for _ in range(MAX_CONSECUTIVE_FAILURES + 3)]
    user_id = await _user_listening_to(*artists)

    def down(artist):
        raise pylast.WSError(None, "8", "Operation failed")

    assert len(await _fill(user_id, down)) == MAX_CONSECUTIVE_FAILURES


@pytest.mark.asyncio
async def test_a_database_error_on_one_artist_does_not_lose_the_others():
    long_tag, fine = _name("long"), _name("fine")
    user_id = await _user_listening_to(long_tag, fine)
    # Tag.name holds 255 characters: storing this one fails in the database.
    tags = {long_tag: [{"name": "x" * 300, "count": 100}], fine: [{"name": "ok", "count": 100}]}
    await _fill(user_id, tags.__getitem__)
    assert await _known(user_id) == {fine: [{"name": "ok", "count": 100}]}


@pytest.mark.asyncio
async def test_replacing_tags_leaves_the_shared_tag_rows():
    artist = _name()
    tag = _name("tag")
    async with _TestSessionLocal() as db:
        await replace_artist_tags(db, artist, [{"name": tag, "count": 10}])
        await replace_artist_tags(db, artist, [])
        await db.commit()
        assert await db.scalar(select(Tag.name).where(Tag.name == tag)) == tag
        assert await db.scalar(select(ArtistTag.artist).where(ArtistTag.artist == artist)) is None


@pytest.mark.asyncio
async def test_background_pass_runs_once_per_user_and_then_allows_another():
    artist = _name()
    user_id = await _user_listening_to(artist)
    asked = []

    def fake(name):
        asked.append(name)
        return []

    ended = []
    with (
        patch.object(tag_catalogue, "async_session", _TestSessionLocal),
        patch.object(tag_catalogue, "get_artist_tags", fake),
        patch.object(tag_catalogue, "after_pass", [ended.append]),
    ):
        tag_catalogue.start_tag_catalogue(user_id, "someone")
        tag_catalogue.start_tag_catalogue(user_id, "someone")
        assert len(tag_catalogue._background_tasks) == 1
        assert tag_catalogue.is_tagging(user_id)
        await asyncio.gather(*tag_catalogue._background_tasks)
    assert asked == [artist]
    assert not tag_catalogue.is_tagging(user_id)
    # Runs filtering by tags wait for this moment.
    assert ended == [user_id]


def _tags_response(payload):
    response = MagicMock()
    response.json.return_value = payload
    return response


def test_artist_tags_parsing_normalizes_and_keeps_the_top_ones():
    many = [{"name": f"t{n}", "count": 100 - n} for n in range(lastfm.ARTIST_TAGS_KEPT + 5)]
    with (
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
        patch("httpx.get", return_value=_tags_response({"toptags": {"tag": many}})),
    ):
        tags = lastfm.get_artist_tags("X")
    assert len(tags) == lastfm.ARTIST_TAGS_KEPT
    assert tags[0] == {"name": "t0", "count": 100}


def test_artist_tags_of_an_unknown_artist_are_empty_but_other_errors_raise():
    with patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0):
        with patch("httpx.get", return_value=_tags_response({"error": 6, "message": "not found"})):
            assert lastfm.get_artist_tags("Nobody") == []
        with patch("httpx.get", return_value=_tags_response({"toptags": {}})):
            assert lastfm.get_artist_tags("Tagless") == []
        with (
            patch("httpx.get", return_value=_tags_response({"error": 8, "message": "failed"})),
            pytest.raises(pylast.WSError),
        ):
            lastfm.get_artist_tags("Down")


@pytest.mark.asyncio
async def test_finished_sync_starts_the_catalogue():
    user_id = await _user_listening_to()
    with (
        patch.object(scrobble_sync, "get_scrobble_page", return_value=([], 0)),
        patch.object(scrobble_sync, "get_loved_page", return_value=([], 1)),
        patch.object(scrobble_sync, "start_tag_catalogue") as start,
    ):
        async with _TestSessionLocal() as db:
            await scrobble_sync.sync_scrobbles(db, user_id, "u")
    start.assert_called_once_with(user_id, "u")


@pytest.mark.asyncio
async def test_a_pass_prints_every_few_artists_not_every_call(activity_lines):
    user_id = await _user_listening_to(*[_name() for _ in range(5)])
    with patch.object(tag_catalogue, "LOG_EVERY", 2):
        await _fill(user_id, lambda _artist: [])
    lines = activity_lines()
    assert lines[:3] == [
        "tags   someone   début, 5 artistes à chercher",
        "tags   someone   2/5 artistes",
        "tags   someone   4/5 artistes",
    ]
    assert lines[3].startswith("tags   someone   terminé, 5 artistes  ")
    assert len(lines) == 4


@pytest.mark.asyncio
async def test_sync_status_shows_a_running_pass_only(client):
    email = _unique_email()
    await _register_and_login(client, email)
    async with _TestSessionLocal() as db:
        user_id = await db.scalar(select(User.id).where(User.email == email))

    async def tags_status():
        body = (await client.get("/api/scrobbles/sync")).json()
        return body["tags_done"], body["tags_total"]

    key = tag_catalogue.tags_progress_key(user_id)
    assert await tags_status() == (0, 0)
    progress_store.start(key)
    progress_store.report(key, "tags", 3, 10)
    assert await tags_status() == (3, 10)
    progress_store.finish(key)
    assert await tags_status() == (0, 0)


@pytest.mark.asyncio
async def test_background_pass_reports_its_progress():
    artists = [_name(), _name()]
    user_id = await _user_listening_to(*artists)
    key = tag_catalogue.tags_progress_key(user_id)
    seen = []

    def fake(artist):
        progress = progress_store.read(key)
        seen.append((progress.stage, progress.done, progress.total))
        return []

    with (
        patch.object(tag_catalogue, "async_session", _TestSessionLocal),
        patch.object(tag_catalogue, "get_artist_tags", fake),
    ):
        tag_catalogue.start_tag_catalogue(user_id, "someone")
        await asyncio.gather(*tag_catalogue._background_tasks)
    assert seen == [("tags", 0, 2), ("tags", 1, 2)]
    assert progress_store.read(key).stage == "done"


@pytest.mark.asyncio
async def test_known_tags_cover_this_users_artists_most_widespread_first():
    mine, also_mine, other = _name("mine"), _name("also"), _name("other")
    user_id = await _user_listening_to(mine, also_mine)
    common, rare, foreign = _name("Common"), _name("rare"), _name("foreign")
    async with _TestSessionLocal() as db:
        await upsert_artist_tag(db, mine, common, 100)
        await upsert_artist_tag(db, mine, rare, 50)
        await upsert_artist_tag(db, also_mine, common.lower(), 90)
        await upsert_artist_tag(db, other, foreign, 100)
        await db.commit()
        tags = await get_known_tags(db, user_id)
    assert tags == [{"name": common.lower(), "artists": 2}, {"name": rare, "artists": 1}]
