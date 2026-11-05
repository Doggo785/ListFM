"""What the Dashboard tells about a person's listening. Read from stored listens only, no Last.fm call but album art."""

import calendar
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from repositories.scrobbles import (
    count_listens_since,
    get_daily_listens,
    get_monthly_albums,
    get_top_albums,
    get_top_artists,
)
from schemas import ListeningStory, StoryAlbum, StoryMoment, StoryMonth
from sqlalchemy import Row
from sqlalchemy.ext.asyncio import AsyncSession

MONTHS_SHOWN = 12
MOMENT_DAYS = 30
MOMENT_ALBUMS = 4
MOMENT_RUNNERS_UP = 2
# Past these, a month without art shows the ribbon alone.
ALBUMS_TRIED_PER_MONTH = 4


def _months_back(local_now: datetime, count: int) -> datetime:
    """The first instant of the month `count` months before this one, in the same zone."""
    index = local_now.year * 12 + local_now.month - 1 - count
    return local_now.replace(year=index // 12, month=index % 12 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)


def _days_of_month(month: datetime, daily: dict[datetime, int]) -> list[int]:
    length = calendar.monthrange(month.year, month.month)[1]
    return [daily.get(month.replace(day=day), 0) for day in range(1, length + 1)]


def _album(row: Row, artist: str) -> StoryAlbum:
    return StoryAlbum(title=row.title, artist=artist, plays=row.plays, cover_url=row.image_url)


def _shown(candidates: list[Row]) -> Row | None:
    """The first album with art, or the first one when none has any."""
    return next((row for row in candidates if row.image_url), candidates[0] if candidates else None)


def _build_months(rows: list[Row], daily: dict[datetime, int]) -> tuple[list[StoryMonth], list[list[Row]]]:
    """Each month's top artist and their album. The year doesn't repeat a cover if the artist has another."""
    by_month: dict[datetime, list[Row]] = defaultdict(list)
    for row in rows:
        by_month[row.month].append(row)
    months: list[StoryMonth] = []
    candidates_per_month: list[list[Row]] = []
    used_ids: set[str] = set()
    for month in sorted(by_month):
        plays: dict[str, int] = defaultdict(int)
        for row in by_month[month]:
            plays[row.artist] += row.plays
        artist = min(plays, key=lambda name: (-plays[name], name))
        albums = sorted(
            (row for row in by_month[month] if row.artist == artist and row.id),
            key=lambda row: (row.id in used_ids, -row.plays, row.title),
        )[:ALBUMS_TRIED_PER_MONTH]
        shown = _shown(albums)
        months.append(
            StoryMonth(
                month=month.strftime("%Y-%m"),
                listens=sum(row.plays for row in by_month[month]),
                days=_days_of_month(month, daily),
                artist=artist,
                artist_plays=plays[artist],
                album=_album(shown, artist) if shown else None,
            )
        )
        if shown:
            used_ids.add(shown.id)
        candidates_per_month.append(albums)
    return months, candidates_per_month


async def _build_moment(db: AsyncSession, user_id: str, now: datetime) -> tuple[StoryMoment | None, list[Row]]:
    days: int | None = MOMENT_DAYS
    start: datetime | None = now - timedelta(days=MOMENT_DAYS)
    artists = await get_top_artists(db, user_id, start, MOMENT_RUNNERS_UP + 1)
    if not artists:
        days = start = None
        artists = await get_top_artists(db, user_id, None, MOMENT_RUNNERS_UP + 1)
    if not artists:
        return None, []
    albums = await get_top_albums(db, user_id, start, MOMENT_ALBUMS)
    return (
        StoryMoment(
            artist=artists[0].artist,
            plays=artists[0].plays,
            days=days,
            runners_up=[row.artist for row in artists[1:]],
            albums=[_album(row, row.artist) for row in albums],
        ),
        albums,
    )


def _awaiting_art(candidates: list[Row]) -> bool:
    """Whether a look-up could still change what this list shows."""
    for row in candidates:
        if row.image_url:
            return False
        if row.image_fetched_at is None:
            return True
    return False


async def build_story(db: AsyncSession, user_id: str, timezone: str, now: datetime | None = None) -> tuple[ListeningStory, list[list[Row]]]:
    """The story, and the album lists whose art is still to look up."""
    now = now or datetime.now(UTC)
    start = _months_back(now.astimezone(ZoneInfo(timezone)), MONTHS_SHOWN - 1)
    # The grouped month comes back without a zone, like the day keys: both are local.
    daily = await get_daily_listens(db, user_id, start, timezone)
    months, month_albums = _build_months(await get_monthly_albums(db, user_id, start, timezone), daily)
    moment, moment_albums = await _build_moment(db, user_id, now)
    pending = [albums for albums in [*month_albums, *([row] for row in moment_albums)] if _awaiting_art(albums)]
    story = ListeningStory(
        moment=moment,
        months=months,
        listens_last_day=await count_listens_since(db, user_id, now - timedelta(hours=24)),
        covers_pending=bool(pending),
    )
    return story, pending
