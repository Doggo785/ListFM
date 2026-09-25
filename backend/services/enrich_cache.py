"""Async DB-backed enrich cache (P1-8).

The live Last.fm layer (services.lastfm) stays synchronous; this module is
the async bridge. The cache is per-user: every read and write is keyed by
``user_id`` (freshness via ``last_synced_at``), so warm and live paths always
carry identical userplaycount/userloved values.

- read path (all async): track core (TTL via ``last_fetched_at``), album
  title, artist tags and album tags, per-user data (TTL via
  ``last_synced_at``). All-or-nothing per track: anything missing or stale
  triggers a full live refetch of that track. The track stamp gates the
  whole snapshot — write-back always stores core and tags atomically, so a
  fresh track implies freshly fetched tags (including legitimately empty
  tag lists, which have no rows to timestamp).
- miss path: the existing sync ``enrich_tracks`` runs in an executor (with
  the global ~1s throttle gate inside), then results are written back.

Callers must commit the session (writes happen on misses).
"""

import asyncio
import logging
from datetime import UTC, datetime

from models.album import Album
from models.album_tag import AlbumTag
from models.artist_tag import ArtistTag
from models.tag import Tag
from models.track import Track
from models.user_track import UserTrack
from repositories.albums import get_or_create_album
from repositories.tags import upsert_album_tag, upsert_artist_tag
from repositories.tracks import CACHE_TTL, get_or_create_track
from repositories.user_tracks import upsert_user_track
from services.lastfm import enrich_tracks, epoch_to_datetime, get_lastfm_call_count
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _fresh(ts) -> bool:
    return ts is not None and ts >= (datetime.now(UTC) - CACHE_TTL)


async def _read_cached_tracks(
    db: AsyncSession, *, user_id: str, tracks: list[dict]
) -> list[dict | None]:
    """Rebuild enriched tracks from DB rows, None per miss/stale track.

    Bulk variant of the per-track read: one query per table (tracks,
    artist tags, albums, album tags, user rows) instead of N+1 round-trips.
    Same all-or-nothing semantics per track.
    """
    if not tracks:
        return []
    pairs = list({(t.get("artist", ""), t.get("title", "")) for t in tracks})

    track_rows = (
        await db.execute(
            select(Track).where(tuple_(Track.artist, Track.title).in_(pairs))
        )
    ).scalars().all()
    by_key = {(r.artist, r.title): r for r in track_rows}

    artists = list({r.artist for r in track_rows})
    artist_tags_rows = (
        await db.execute(
            select(ArtistTag.artist, Tag.name, ArtistTag.weight)
            .join(Tag, Tag.id == ArtistTag.tag_id)
            .where(ArtistTag.artist.in_(artists))
        )
    ).all() if artists else []
    artist_tags_map: dict[str, list[dict]] = {}
    for artist, name, weight in artist_tags_rows:
        artist_tags_map.setdefault(artist, []).append({"name": name, "count": weight})

    album_ids = list({r.album_id for r in track_rows if r.album_id})
    albums_map = (
        {
            r.id: r
            for r in (
                await db.execute(select(Album).where(Album.id.in_(album_ids)))
            ).scalars().all()
        }
        if album_ids
        else {}
    )
    album_tags_rows = (
        await db.execute(
            select(AlbumTag.album_id, Tag.name, AlbumTag.weight)
            .join(Tag, Tag.id == AlbumTag.tag_id)
            .where(AlbumTag.album_id.in_(album_ids))
        )
    ).all() if album_ids else []
    album_tags_map: dict[str, list[dict]] = {}
    for album_id, name, weight in album_tags_rows:
        album_tags_map.setdefault(album_id, []).append({"name": name, "count": weight})

    track_ids = [r.id for r in track_rows]
    user_map = (
        {
            r.track_id: r
            for r in (
                await db.execute(
                    select(UserTrack).where(
                        UserTrack.user_id == user_id,
                        UserTrack.track_id.in_(track_ids),
                    )
                )
            ).scalars().all()
        }
        if track_ids
        else {}
    )

    out = []
    for track in tracks:
        row = by_key.get((track.get("artist", ""), track.get("title", "")))
        if row is None or not _fresh(row.last_fetched_at):
            out.append(None)
            continue
        album_title = None
        if row.album_id:
            album = albums_map.get(row.album_id)
            if album is None:
                out.append(None)
                continue
            album_title = album.title
            album_tags = album_tags_map.get(row.album_id, [])
        else:
            album_tags = []
        user_row = user_map.get(row.id)
        if user_row is None or not _fresh(user_row.last_synced_at):
            out.append(None)
            continue
        out.append(
            {
                **track,
                "listeners": row.listeners,
                "global_playcount": row.global_playcount,
                "album": album_title,
                "artist_tags": artist_tags_map.get(row.artist, []),
                "album_tags": album_tags,
                "userplaycount": user_row.user_playcount,
                "userloved": user_row.userloved,
            }
        )
    return out


async def _write_back(
    db: AsyncSession, *, user_id: str, base_tracks: list[dict], enriched_tracks: list[dict]
) -> None:
    """Persist live enrich results (core, tags, user data). Caller commits."""
    now = datetime.now(UTC)
    for base, info in zip(base_tracks, enriched_tracks):
        artist = base.get("artist", "")
        title = base.get("title", "")
        album_id = None
        if info.get("album"):
            album = await get_or_create_album(db, info["album"], artist)
            album_id = album.id
            for tag in info.get("album_tags") or []:
                await upsert_album_tag(db, album_id, tag["name"], tag["count"])
        track = await get_or_create_track(
            db,
            title,
            artist,
            album_id=album_id,
            listeners=info.get("listeners", 0) or 0,
            global_playcount=info.get("global_playcount", 0) or 0,
        )
        # A live fetch re-stamps the row even if the core was still fresh
        # (e.g. only the tags were stale), so the next read is a full hit.
        track.listeners = info.get("listeners", 0) or 0
        track.global_playcount = info.get("global_playcount", 0) or 0
        track.album_id = album_id or track.album_id
        track.last_fetched_at = now
        await db.flush()
        for tag in info.get("artist_tags") or []:
            await upsert_artist_tag(db, artist, tag["name"], tag["count"])
        await upsert_user_track(
            db,
            user_id,
            track.id,
            user_playcount=info.get("userplaycount", 0) or 0,
            userloved=bool(info.get("userloved", False)),
            last_played_at=epoch_to_datetime(base.get("timestamp")),
        )


async def enrich_tracks_cached(
    db: AsyncSession,
    *,
    user_id: str,
    username: str,
    tracks: list[dict],
    max_enrich: int = 50,
) -> tuple[list[dict], dict]:
    """Enrich via cache, live-fetching only misses. Returns (tracks, stats)."""
    to_enrich = tracks[:max_enrich]
    tail = tracks[max_enrich:]
    cached = await _read_cached_tracks(db, user_id=user_id, tracks=to_enrich)

    miss_idx = [i for i, c in enumerate(cached) if c is None]
    stats = {"hits": len(to_enrich) - len(miss_idx), "misses": len(miss_idx), "lastfm_calls": 0}
    if miss_idx:
        miss_tracks = [to_enrich[i] for i in miss_idx]
        before = get_lastfm_call_count()
        loop = asyncio.get_running_loop()
        live = await loop.run_in_executor(None, enrich_tracks, username, miss_tracks, len(miss_tracks))
        stats["lastfm_calls"] = get_lastfm_call_count() - before
        await _write_back(db, user_id=user_id, base_tracks=miss_tracks, enriched_tracks=live)
        for i, enriched in zip(miss_idx, live):
            cached[i] = enriched
    logger.info(
        "enrich cache: %d hits, %d misses, %d Last.fm calls",
        stats["hits"],
        stats["misses"],
        stats["lastfm_calls"],
    )
    return [c for c in cached if c is not None] + tail, stats
