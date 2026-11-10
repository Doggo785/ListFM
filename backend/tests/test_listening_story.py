"""The Dashboard's story: who tops each month, with whose album, and what art is still due."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from models.album import Album
from models.scrobble import Scrobble
from models.track import Track
from models.user import User
from services import album_covers
from services.listening_story import build_story
from sqlalchemy import select, update

from .conftest import _cleanup_user, _TestSessionLocal, _unique_email
from .test_preview import _register_login_link

NOW = datetime(2026, 11, 5, 12, tzinfo=UTC)
LOADED = datetime(2026, 1, 1, tzinfo=UTC)


async def _user(db) -> str:
    user_id = str(uuid.uuid4())
    db.add(User(id=user_id, email=_unique_email()))
    await db.flush()
    return user_id


async def _track(db, artist, album=None, image="https://img/x.png", fetched=LOADED) -> str:
    album_id = None
    if album:
        album_id = await db.scalar(select(Album.id).where(Album.title == album, Album.artist == artist))
        if not album_id:
            album_id = str(uuid.uuid4())
            db.add(Album(id=album_id, title=album, artist=artist, image_url=image, image_fetched_at=fetched))
            await db.flush()
    track_id = str(uuid.uuid4())
    db.add(Track(id=track_id, title=f"t-{track_id}", artist=artist, album_id=album_id))
    await db.flush()
    return track_id


async def _listen(db, user_id, track_id, *moments):
    for moment in moments:
        db.add(Scrobble(user_id=user_id, track_id=track_id, played_at=moment))
    await db.flush()


def _times(start, count):
    return [start + timedelta(minutes=n) for n in range(count)]


@pytest.mark.asyncio
async def test_a_month_shows_its_top_artist_with_their_own_album():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        # The most played album belongs to someone else than the most played artist.
        one_album = await _track(db, "Solo", "Big Album")
        await _listen(db, user, one_album, *_times(datetime(2026, 9, 3, tzinfo=UTC), 5))
        for number in range(3):
            track = await _track(db, "Top", f"Album {number}", image=f"https://img/{number}.png")
            await _listen(db, user, track, *_times(datetime(2026, 9, 4 + number, tzinfo=UTC), 2 + number))
        story, _ = await build_story(db, user, "UTC", NOW)
    month = story.months[0]
    assert (month.month, month.artist, month.artist_plays, month.listens) == ("2026-09", "Top", 9, 14)
    assert (month.album.title, month.album.artist, month.album.plays) == ("Album 2", "Top", 4)
    assert month.album.cover_url == "https://img/2.png"
    assert month.days[2] == 5 and len(month.days) == 30


@pytest.mark.asyncio
async def test_two_months_in_a_row_do_not_repeat_a_cover_when_the_artist_has_another():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        main = await _track(db, "Same", "Main")
        other = await _track(db, "Same", "Other")
        await _listen(db, user, main, *_times(datetime(2026, 8, 3, tzinfo=UTC), 9))
        await _listen(db, user, main, *_times(datetime(2026, 9, 3, tzinfo=UTC), 9))
        await _listen(db, user, other, *_times(datetime(2026, 9, 4, tzinfo=UTC), 2))
        await _listen(db, user, main, *_times(datetime(2026, 10, 3, tzinfo=UTC), 9))
        story, _ = await build_story(db, user, "UTC", NOW)
    assert [month.album.title for month in story.months] == ["Main", "Other", "Main"]


@pytest.mark.asyncio
async def test_listens_fall_in_the_persons_own_month_and_day():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        track = await _track(db, "Late")
        await _listen(db, user, track, datetime(2026, 9, 30, 23, 30, tzinfo=UTC))
        story, _ = await build_story(db, user, "Europe/Paris", NOW)
    assert story.months[0].month == "2026-10"
    assert story.months[0].days[0] == 1
    assert story.months[0].album is None


@pytest.mark.asyncio
async def test_only_the_last_twelve_months_are_told():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        track = await _track(db, "Old")
        await _listen(db, user, track, datetime(2025, 11, 30, tzinfo=UTC), datetime(2025, 12, 1, 1, tzinfo=UTC))
        story, _ = await build_story(db, user, "UTC", NOW)
    assert [month.month for month in story.months] == ["2025-12"]


@pytest.mark.asyncio
async def test_the_moment_ranks_the_last_thirty_days():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        for artist, count in (("Now", 3), ("Second", 2), ("Third", 1), ("Fourth", 1)):
            track = await _track(db, artist, f"{artist} album")
            await _listen(db, user, track, *_times(NOW - timedelta(days=2), count))
        old = await _track(db, "Before", "Before album")
        await _listen(db, user, old, *_times(NOW - timedelta(days=40), 9))
        recent = await _track(db, "Today")
        await _listen(db, user, recent, NOW - timedelta(hours=1))
        story, _ = await build_story(db, user, "UTC", NOW)
    assert (story.moment.artist, story.moment.plays, story.moment.days) == ("Now", 3, 30)
    assert story.moment.runners_up == ["Second", "Fourth"]
    assert [album.title for album in story.moment.albums][:2] == ["Now album", "Second album"]
    assert story.listens_last_day == 1


@pytest.mark.asyncio
async def test_the_moment_falls_back_on_all_listens_when_the_last_days_hold_none():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        await _listen(db, user, await _track(db, "Long ago"), NOW - timedelta(days=900))
        story, _ = await build_story(db, user, "UTC", NOW)
    assert (story.moment.artist, story.moment.days) == ("Long ago", None)
    assert story.months == []


@pytest.mark.asyncio
async def test_nobody_listened_yet():
    async with _TestSessionLocal() as db:
        story, due = await build_story(db, await _user(db), "UTC", NOW)
    assert story.moment is None and story.months == [] and not story.covers_pending and due == []


@pytest.mark.asyncio
async def test_art_is_due_until_each_list_shows_one_or_ran_out():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        await _listen(db, user, await _track(db, "A", "Unknown", image=None, fetched=None), NOW - timedelta(days=1))
        await _listen(db, user, await _track(db, "B", "Has art"), NOW - timedelta(days=45))
        await _listen(db, user, await _track(db, "C", "Known none", image=None), NOW - timedelta(days=80))
        story, due = await build_story(db, user, "UTC", NOW)
    assert story.covers_pending
    assert {row.title for albums in due for row in albums} == {"Unknown"}


@pytest.mark.asyncio
async def test_a_look_up_pass_stops_at_the_first_cover_of_each_list():
    async with _TestSessionLocal() as db:
        user = await _user(db)
        # Albums outlive a test: fresh titles, or a former pass's art would still be there.
        first_title, second_title = f"First {user}", f"Second {user}"
        await _listen(db, user, await _track(db, "A", first_title, image=None, fetched=None), *_times(NOW - timedelta(days=1), 2))
        await _listen(db, user, await _track(db, "A", second_title, image=None, fetched=None), NOW - timedelta(days=1, hours=2))
        _, due = await build_story(db, user, "UTC", NOW)
        await db.commit()
    with patch.object(album_covers, "get_album_image", return_value="https://img/got.png") as get:
        async with _TestSessionLocal() as db:
            await album_covers._walk_albums(db, due[:1], 1, "u")  # The month's list; the poster's shelf asks for each of its albums.
    assert [call.args[1] for call in get.call_args_list] == [first_title]


@pytest.mark.asyncio
async def test_the_route_answers_and_starts_the_look_ups_once_the_first_import_is_done(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        async with _TestSessionLocal() as db:
            user = await db.scalar(select(User.id).where(User.email == email))
            await _listen(db, user, await _track(db, "A", "No art yet", image=None, fetched=None), datetime.now(UTC) - timedelta(hours=1))
            await db.commit()
        with patch("routers.users.start_album_covers") as start:
            response = await client.get("/api/scrobbles/story")
        assert response.status_code == 200
        body = response.json()
        assert body["moment"]["artist"] == "A"
        assert body["covers_pending"] is True
        assert body["listens_last_day"] == 1
        # The import is still running: the albums shown will change, nothing is looked up yet.
        assert start.call_count == 0
        async with _TestSessionLocal() as db:
            await db.execute(update(User).where(User.id == user).values(scrobbles_complete_at=datetime.now(UTC)))
            await db.commit()
        with patch("routers.users.start_album_covers") as start:
            assert (await client.get("/api/scrobbles/story")).json()["covers_pending"] is True
        assert start.call_count == 1
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_the_route_needs_a_session(client: AsyncClient):
    client.cookies.clear()
    assert (await client.get("/api/scrobbles/story")).status_code == 401
