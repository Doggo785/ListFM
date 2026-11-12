"""What a visitor can ask without an account. Every Last.fm call here spends the budget the signed-in users' syncs share."""

import asyncio
import re
import time
from datetime import UTC, datetime

import pylast
from fastapi import APIRouter, HTTPException, Request
from schemas import ListenerGlimpse, ListenerRequest
from services.activity_log import log_activity
from services.lastfm import (
    PAGE_ERRORS,
    get_listener_glimpse,
    is_rate_limit_error,
    note_rate_limited,
)
from services.rate_limit import (
    listener_limiter,
    listener_total_limiter,
    rate_limit,
    rate_limit_by_key,
)

router = APIRouter(prefix="/api/public", tags=["public"])

USERNAME = re.compile(r"[A-Za-z0-9_-]{2,32}")
UNKNOWN = "The thread can't find that name. It's the one in your Last.fm profile's address."
PRIVATE = "This profile keeps its listens private, so the thread can't read them."
BUSY = "The thread is busy, try again in a minute."
DOWN = "Last.fm isn't answering. Try again in a minute."
REMEMBER_SECONDS = 3600
REMEMBERED = 1024

# In memory only and gone within the hour: nothing about a visitor reaches the database or the console.
_remembered: dict[str, tuple[float, ListenerGlimpse]] = {}


def _recall(key: str) -> ListenerGlimpse | None:
    entry = _remembered.get(key)
    if entry is None or entry[0] < time.monotonic():
        _remembered.pop(key, None)
        return None
    return entry[1]


def _remember(key: str, glimpse: ListenerGlimpse) -> None:
    if len(_remembered) >= REMEMBERED:
        _remembered.pop(next(iter(_remembered)))
    _remembered[key] = (time.monotonic() + REMEMBER_SECONDS, glimpse)


def forget_listeners() -> None:
    _remembered.clear()


def same_month_a_year_ago(now: datetime) -> tuple[datetime, datetime]:
    start = datetime(now.year - 1, now.month, 1, tzinfo=UTC)
    return start, datetime(start.year + start.month // 12, start.month % 12 + 1, 1, tzinfo=UTC)


@router.post("/listener", response_model=ListenerGlimpse)
async def listener_glimpse(body: ListenerRequest, request: Request):
    """A public profile's artist of the month and its top tracks of this month last year. A POST, so the name stays out of access logs."""
    rate_limit(request, listener_limiter)
    username = body.username.strip()
    if not USERNAME.fullmatch(username):
        raise HTTPException(status_code=404, detail=UNKNOWN)
    key = username.casefold()
    remembered = _recall(key)
    if remembered is not None:
        return remembered
    try:
        rate_limit_by_key(listener_total_limiter, "all")
    except HTTPException as exc:
        raise HTTPException(status_code=503, detail=BUSY) from exc

    start, end = same_month_a_year_ago(datetime.now(UTC))
    log_activity("landing", "visitor", "preview of a username")
    try:
        artist, tracks = await asyncio.to_thread(get_listener_glimpse, username, int(start.timestamp()), int(end.timestamp()))
    except pylast.WSError as exc:
        if str(exc.status) == "6":
            raise HTTPException(status_code=404, detail=UNKNOWN) from exc
        if str(exc.status) == "17":
            raise HTTPException(status_code=403, detail=PRIVATE) from exc
        if is_rate_limit_error(exc):
            note_rate_limited()
            raise HTTPException(status_code=503, detail=BUSY) from exc
        raise HTTPException(status_code=503, detail=DOWN) from exc
    except PAGE_ERRORS as exc:
        raise HTTPException(status_code=503, detail=DOWN) from exc

    glimpse = ListenerGlimpse(artist=artist, month=start.strftime("%B %Y"), tracks=tracks)
    _remember(key, glimpse)
    return glimpse
