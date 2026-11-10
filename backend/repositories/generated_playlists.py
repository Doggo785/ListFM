import uuid
from datetime import UTC, datetime

from models.album import Album
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from models.track import Track
from repositories.tracks import get_or_create_track
from schemas import GeneratedPlaylistCreate
from sqlalchemy import Row, Select, select
from sqlalchemy.ext.asyncio import AsyncSession

COVERS_PER_PLAYLIST = 4


async def get_generated_playlists(db: AsyncSession, user_id: str) -> list[GeneratedPlaylist]:
    """Get all generated playlists for a user, newest first."""
    result = await db.execute(
        select(GeneratedPlaylist)
        .where(
            GeneratedPlaylist.user_id == user_id,
            GeneratedPlaylist.deleted_at.is_(None),
        )
        .order_by(GeneratedPlaylist.generated_at.desc())
    )
    return list(result.scalars().all())


def _albums_of_user_playlists(user_id: str, *columns) -> Select:
    """Selects from each album of this user's live playlists."""
    return (
        select(*columns)
        .join(GeneratedPlaylist, GeneratedPlaylist.id == PlaylistTrack.playlist_id)
        .join(Track, Track.id == PlaylistTrack.track_id)
        .join(Album, Album.id == Track.album_id)
        .where(GeneratedPlaylist.user_id == user_id, GeneratedPlaylist.deleted_at.is_(None))
    )


async def get_playlist_covers(db: AsyncSession, user_id: str) -> dict[str, list[str]]:
    """Up to COVERS_PER_PLAYLIST different album covers per playlist, in track order."""
    rows = await db.execute(
        _albums_of_user_playlists(user_id, PlaylistTrack.playlist_id, Album.image_url)
        .where(Album.image_url.is_not(None))
        .order_by(PlaylistTrack.playlist_id, PlaylistTrack.position)
    )
    covers: dict[str, list[str]] = {}
    for playlist_id, image_url in rows:
        kept = covers.setdefault(playlist_id, [])
        if len(kept) < COVERS_PER_PLAYLIST and image_url not in kept:
            kept.append(image_url)
    return covers


async def get_cover_candidates(db: AsyncSession, user_id: str) -> list[list[Row]]:
    """Each playlist's different albums in track order, newest playlists first."""
    rows = await db.execute(
        _albums_of_user_playlists(
            user_id, PlaylistTrack.playlist_id, Album.id, Album.title, Album.artist, Album.image_url, Album.image_fetched_at
        )
        .order_by(GeneratedPlaylist.generated_at.desc(), PlaylistTrack.playlist_id, PlaylistTrack.position)
    )
    playlists: dict[str, dict[str, Row]] = {}
    for row in rows:
        playlists.setdefault(row.playlist_id, {}).setdefault(row.id, row)
    return [list(albums.values()) for albums in playlists.values()]


async def get_generated_playlist(db: AsyncSession, playlist_id: str, user_id: str) -> GeneratedPlaylist | None:
    """Get a single generated playlist by ID, scoped to user."""
    result = await db.execute(
        select(GeneratedPlaylist).where(
            GeneratedPlaylist.id == playlist_id,
            GeneratedPlaylist.user_id == user_id,
            GeneratedPlaylist.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_generated_playlist(
    db: AsyncSession,
    user_id: str,
    lastfm_username: str,
    data: GeneratedPlaylistCreate,
    mark_fetched: bool = True,
) -> GeneratedPlaylist:
    """Create a new generated playlist record.

    Caller is responsible for committing the session. All track lookups
    and playlist_track inserts happen within the same uncommitted transaction,
    ensuring atomicity. Pass mark_fetched=False when the tracks were not
    just live-fetched (persist-from-run, manual save), so the rows are not
    stamped as freshly enriched.
    """
    now = datetime.now(UTC)
    playlist = GeneratedPlaylist(
        id=str(uuid.uuid4()),
        user_id=user_id,
        automation_id=data.automation_id,
        lastfm_username=lastfm_username,
        name=data.name,
        description=data.description,
        track_count=data.track_count,
        filter_groups=data.filter_groups,
        period_start=data.period_start,
        period_end=data.period_end,
        generated_at=now,
    )
    db.add(playlist)
    await db.flush()  # get playlist.id before referencing it in PlaylistTrack

    for i, track_data in enumerate(data.tracks):
        track = await get_or_create_track(
            db, title=track_data.title, artist=track_data.artist,
            mark_fetched=mark_fetched,
        )
        playlist_track = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=i,
        )
        db.add(playlist_track)

    await db.flush()
    await db.refresh(playlist)
    return playlist


async def get_playlist_tracks(
    db: AsyncSession, playlist_id: str, user_id: str
) -> list[dict] | None:
    """Ordered track entries of a playlist, or None if missing/foreign."""
    playlist = await get_generated_playlist(db, playlist_id, user_id)
    if playlist is None:
        return None
    result = await db.execute(
        select(Track.title, Track.artist, PlaylistTrack.position)
        .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    return [
        {"position": position, "title": title, "artist": artist}
        for title, artist, position in result.all()
    ]


async def delete_generated_playlist(db: AsyncSession, playlist_id: str, user_id: str) -> bool:
    """Soft delete a generated playlist. Returns True if deleted, False if not found.

    Caller is responsible for committing the session.
    """
    playlist = await get_generated_playlist(db, playlist_id, user_id)
    if playlist is None:
        return False
    playlist.deleted_at = datetime.now(UTC)
    await db.flush()
    return True


async def get_tracks_of_recent_playlists(
    db: AsyncSession, user_id: str, automation_id: str, playlists: int
) -> set[tuple[str, str]]:
    """(title, artist) of the automation's last playlists. Scoped to the owner."""
    recent = (
        select(GeneratedPlaylist.id)
        .where(
            GeneratedPlaylist.user_id == user_id,
            GeneratedPlaylist.automation_id == automation_id,
            GeneratedPlaylist.deleted_at.is_(None),
        )
        .order_by(GeneratedPlaylist.generated_at.desc())
        .limit(playlists)
    )
    rows = await db.execute(
        select(Track.title, Track.artist)
        .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
        .where(PlaylistTrack.playlist_id.in_(recent))
    )
    return {(row.title, row.artist) for row in rows}
