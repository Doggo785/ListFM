"""Album art: which albums get looked up, how failures behave, what the list returns."""

import asyncio
import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pylast
import pytest
from models.album import Album
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from models.track import Track
from models.user import User
from repositories.generated_playlists import get_playlist_covers
from services import album_covers, lastfm
from services.album_covers import MAX_CONSECUTIVE_FAILURES, fill_album_covers
from sqlalchemy import delete, select

from .conftest import _cleanup_user, _TestSessionLocal, _unique_email
from .test_preview import _register_login_link


async def _playlist_with_albums(count, **album_fields):
    """A user with one playlist holding one track from each of ``count`` new albums."""
    user_id = str(uuid.uuid4())
    album_ids = [str(uuid.uuid4()) for _ in range(count)]
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email()))
        await db.flush()
        playlist = GeneratedPlaylist(
            id=str(uuid.uuid4()), user_id=user_id, lastfm_username="u", name="p",
            track_count=count, generated_at=datetime.now(UTC),
        )
        db.add(playlist)
        await db.flush()
        for position, album_id in enumerate(album_ids):
            track_id = str(uuid.uuid4())
            db.add(Album(id=album_id, title=f"album-{album_id}", artist="a", **album_fields))
            await db.flush()
            db.add(Track(id=track_id, title=f"t-{track_id}", artist="a", album_id=album_id))
            await db.flush()
            db.add(PlaylistTrack(playlist_id=playlist.id, track_id=track_id, position=position))
        await db.commit()
    return user_id, playlist.id, album_ids


async def _album(album_id):
    async with _TestSessionLocal() as db:
        return await db.scalar(select(Album).where(Album.id == album_id))


@pytest.mark.asyncio
async def test_a_pass_stores_the_cover_and_remembers_an_album_without_one():
    user_id, _, (found, missing) = await _playlist_with_albums(2)
    answers = {f"album-{found}": "https://img/x.png", f"album-{missing}": None}
    with patch.object(album_covers, "get_album_image", side_effect=lambda artist, title: answers[title]) as get:
        async with _TestSessionLocal() as db:
            await fill_album_covers(db, user_id, "u")
        assert get.call_count == 2
        assert (await _album(found)).image_url == "https://img/x.png"
        gone = await _album(missing)
        assert gone.image_url is None and gone.image_fetched_at is not None
        # Nothing is asked twice.
        async with _TestSessionLocal() as db:
            await fill_album_covers(db, user_id, "u")
        assert get.call_count == 2


@pytest.mark.asyncio
async def test_a_failed_album_stays_due_and_too_many_failures_stop_the_pass():
    user_id, _, album_ids = await _playlist_with_albums(MAX_CONSECUTIVE_FAILURES + 1)
    with patch.object(album_covers, "get_album_image", side_effect=ValueError("no key here")) as get:
        async with _TestSessionLocal() as db:
            await fill_album_covers(db, user_id, "u")
    assert get.call_count == MAX_CONSECUTIVE_FAILURES
    assert all([(await _album(album_id)).image_fetched_at is None for album_id in album_ids])


@pytest.mark.asyncio
async def test_covers_come_in_track_order_without_repeats_and_stop_at_four():
    user_id, playlist_id, album_ids = await _playlist_with_albums(5, image_fetched_at=datetime.now(UTC))
    async with _TestSessionLocal() as db:
        for number, album_id in enumerate(album_ids):
            (await db.get(Album, album_id)).image_url = f"https://img/{number if number != 1 else 0}.png"
        await db.commit()
        covers = await get_playlist_covers(db, user_id)
    assert covers == {playlist_id: [f"https://img/{n}.png" for n in (0, 2, 3, 4)]}


@pytest.mark.asyncio
async def test_a_deleted_playlist_asks_for_nothing():
    user_id, playlist_id, _ = await _playlist_with_albums(1)
    async with _TestSessionLocal() as db:
        (await db.get(GeneratedPlaylist, playlist_id)).deleted_at = datetime.now(UTC)
        await db.commit()
    with patch.object(album_covers, "get_album_image") as get:
        async with _TestSessionLocal() as db:
            await fill_album_covers(db, user_id, "u")
    get.assert_not_called()


@pytest.mark.asyncio
async def test_one_pass_at_a_time_per_user():
    gate = asyncio.Event()

    async def held(user_id, username):
        await gate.wait()
        album_covers._running.discard(user_id)

    with patch.object(album_covers, "_fill_in_background", side_effect=held) as fill:
        album_covers.start_album_covers("someone", "u")
        album_covers.start_album_covers("someone", "u")
        assert fill.call_count == 1
        gate.set()
        await asyncio.gather(*album_covers._background_tasks)
    assert "someone" not in album_covers._running


@pytest.mark.asyncio
async def test_the_list_returns_the_covers_and_starts_a_pass(client):
    email = _unique_email()
    await _register_login_link(client, email)
    try:
        async with _TestSessionLocal() as db:
            user_id = await db.scalar(select(User.id).where(User.email == email))
            album_id, track_id, playlist_id = (str(uuid.uuid4()) for _ in range(3))
            db.add(Album(id=album_id, title=f"album-{album_id}", artist="a", image_url="https://img/a.png", image_fetched_at=datetime.now(UTC)))
            await db.flush()
            db.add(Track(id=track_id, title=f"t-{track_id}", artist="a", album_id=album_id))
            db.add(GeneratedPlaylist(id=playlist_id, user_id=user_id, lastfm_username="u", name="p", track_count=1, generated_at=datetime.now(UTC)))
            await db.flush()
            db.add(PlaylistTrack(playlist_id=playlist_id, track_id=track_id, position=0))
            await db.commit()
        with patch("routers.generated_playlists.start_album_covers") as start:
            resp = await client.get("/api/generated-playlists")
        assert resp.status_code == 200
        assert resp.json()[0]["cover_images"] == ["https://img/a.png"]
        start.assert_called_once()
    finally:
        async with _TestSessionLocal() as db:
            await db.execute(delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist_id))
            await db.execute(delete(GeneratedPlaylist).where(GeneratedPlaylist.id == playlist_id))
            await db.commit()
        await _cleanup_user(email=email)


def _image(url):
    return [{"size": "small", "#text": "https://img/34s/tiny.png"}, {"size": "extralarge", "#text": url}]


def test_get_album_image_reads_the_best_cover_and_refuses_the_placeholder():
    with patch.object(lastfm, "_lastfm_json", return_value={"album": {"image": _image("https://img/300x300/real.png")}}):
        assert lastfm.get_album_image("a", "b") == "https://img/300x300/real.png"
    placeholder = f"https://img/300x300/{lastfm.NO_IMAGE_HASH}.png"
    with patch.object(lastfm, "_lastfm_json", return_value={"album": {"image": _image(placeholder)}}):
        assert lastfm.get_album_image("a", "b") is None
    with patch.object(lastfm, "_lastfm_json", return_value={"album": {}}):
        assert lastfm.get_album_image("a", "b") is None


def test_get_album_image_says_none_for_an_unknown_album_and_raises_the_rest():
    def failing(status):
        return MagicMock(side_effect=pylast.WSError("network", status, "details"))

    with patch.object(lastfm, "_lastfm_json", failing("6")):
        assert lastfm.get_album_image("a", "b") is None
    with patch.object(lastfm, "_lastfm_json", failing("11")), pytest.raises(pylast.WSError):
        lastfm.get_album_image("a", "b")
