"""Writes the landing page's demo file: the owner's real listens, through the real engine.

Nothing is stored: covers the database lacks are asked of Last.fm for this file only. The output is
public for good once committed, so the owner reads it first and can name what to leave out.

Usage (from the repo root, with the venv): PYTHONPATH=backend python scripts/landing_demo.py OUT.json [--skip-artist NAME]...
"""

import argparse
import asyncio
import json
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pylast
from database import async_session
from models import User
from repositories.scrobbles import get_window_tracks
from services.automation_runner import run_automation_pipeline_cached, window_bounds
from services.lastfm import NO_IMAGE_HASH, _lastfm_json, _pick_image, _throttled_call
from sqlalchemy import select, text

OWNER_NAME = "Doggo"
# The listens before this are a handful, two years apart: on a timeline they read as a hole, not as a story.
SINCE = date(2024, 7, 1)
SIZE = 50
SHAPE_SAMPLES = 96
TRACKS_SHOWN = 5
RUNS = 6
COVERS_ALONG_THE_YEARS = 6
MONTH = {"length": {"amount": 1, "unit": "month"}, "ago": None}
SEASON = {"length": {"amount": 3, "unit": "month"}, "ago": None}
A_YEAR_AGO = {"length": {"amount": 1, "unit": "month"}, "ago": {"amount": 1, "unit": "year"}}
NOT_MUCH = 3
# A cover a stranger may know: the albums under this many Last.fm listeners only fill in when nothing better is there.
KNOWN = 300_000
ALBUMS_PER_QUARTER = 15


def condition(field: str, operator: str, value, **extra) -> dict:
    return {"id": field, "field": field, "operator": operator, "value": value, "valueMax": None, "countMin": 0, "tagSource": "artist", **extra}


def group(*conditions: dict) -> list[dict]:
    return [{"logic": "AND", "conditions": list(conditions), "groups": []}]


def resample(values: list[int], samples: int = SHAPE_SAMPLES) -> list[int]:
    """Any series as a ribbon's width: the same number of points, from 0 to 100."""
    if not values:
        return [0] * samples
    averaged = []
    for i in range(samples):
        start = i * len(values) // samples
        stop = max(start + 1, (i + 1) * len(values) // samples)
        averaged.append(sum(values[start:stop]) / (stop - start))
    peak = max(averaged) or 1
    return [round(100 * value / peak) for value in averaged]


async def rows(db, sql: str, **params):
    return (await db.execute(text(sql), params)).all()


_albums: dict[tuple[str, str], tuple[str | None, int]] = {}


def _album_info(artist: str, album: str) -> tuple[str | None, int]:
    _throttled_call()
    try:
        data = _lastfm_json("album.getInfo", artist=artist, album=album)["album"]
    except pylast.WSError:  # An album Last.fm can't describe just isn't shown.
        return None, 0
    image = _pick_image(data.get("image"), ("extralarge", "large", "medium", "small"))
    return (None if image is None or NO_IMAGE_HASH in image else image), int(data.get("listeners") or 0)


async def album_cover(artist: str, album: str) -> tuple[str | None, int]:
    """An album's cover and how many Last.fm listeners it has, asked once per album."""
    key = (artist.lower(), album.lower())
    if key not in _albums:
        _albums[key] = await asyncio.to_thread(_album_info, artist, album)
    return _albums[key]


async def known_first(albums: list[tuple[str, str]], wanted: int) -> list[str]:
    """Covers in the given order, the albums strangers know first; the others only fill in."""
    known, others = [], []
    for artist, album in dict.fromkeys(albums):
        url, listeners = await album_cover(artist, album)
        if url:
            (known if listeners >= KNOWN else others).append(url)
        if len(known) == wanted:
            break
    return (known + others)[:wanted]


async def playlist_covers(tracks: list[dict], wanted: int = 2) -> list[str]:
    return await known_first([(t["artist"], t["album"]) for t in tracks if t.get("album")], wanted)


def shown(tracks: list[dict], count: int = TRACKS_SHOWN) -> list[dict]:
    return [{"artist": t["artist"], "title": t["title"], "plays": t["playcount"]} for t in tracks[:count]]


def month_label(day: date) -> str:
    return day.strftime("%B %Y")


async def main(out: str, skipped: set[str]) -> None:
    async with async_session() as db:
        user_id = (await rows(db, "select user_id from scrobbles group by 1 order by count(*) desc limit 1"))[0][0]
        timezone = await db.scalar(select(User.timezone).where(User.id == user_id)) or "UTC"
        zone = ZoneInfo(timezone)

        def keep(tracks: list[dict]) -> list[dict]:
            return [t for t in tracks if t["artist"] not in skipped]

        async def run(at: datetime, window: dict, sort: str = "most_played", filters: list | None = None, size: int = SIZE, **extra) -> dict:
            return await run_automation_pipeline_cached(
                db, user_id=user_id, username="", window=window, sort=sort, filter_groups=filters or [], max_tracks=size, at=at, **extra
            )

        total = (await rows(db, "select count(*) from scrobbles where user_id = :u and played_at >= :since", u=user_id, since=SINCE))[0][0]
        weeks = [
            row[0]
            for row in await rows(
                db,
                """select coalesce(c, 0) from generate_series(date_trunc('week', cast(:first as timestamptz)), date_trunc('week', now()), '1 week') g
                   left join (select date_trunc('week', played_at) w, count(*) c from scrobbles where user_id = :u and played_at >= :first group by 1) x on x.w = g order by g""",
                first=SINCE, u=user_id,
            )
        ]
        along = await rows(
            db,
            """select q, artist, title from (
                 select date_trunc('quarter', s.played_at) q, a.artist, a.title, count(*) plays,
                        row_number() over (partition by date_trunc('quarter', s.played_at) order by count(*) desc) r
                 from scrobbles s join tracks t on t.id = s.track_id join albums a on a.id = t.album_id
                 where s.user_id = :u and s.played_at >= :since and a.artist <> all(:skipped) group by 1, 2, 3) x where r <= :per order by q desc, r""",
            u=user_id, since=SINCE, skipped=sorted(skipped) or [""], per=ALBUMS_PER_QUARTER,
        )
        covers = []
        quarters = list(dict.fromkeys(row[0] for row in along))[::-1]
        # Spread along the whole timeline, from its first quarter to its last, not bunched at the recent end.
        last = len(quarters) - 1
        spread = dict.fromkeys(quarters[round(i * last / (COVERS_ALONG_THE_YEARS - 1))] for i in range(COVERS_ALONG_THE_YEARS)) if last > 0 else quarters
        for quarter in spread:
            # Its most played album that a stranger may know.
            found = await known_first([(a, t) for q, a, t in along if q == quarter], 1)
            if found:
                covers.append({"share": round((quarter.date() - SINCE).days / (len(weeks) * 7), 4), "url": found[0]})

        # The recipe of the scene: the same month, a year ago, kept to what was played at least 3 times.
        at = datetime(2026, 11, 1, tzinfo=zone)
        recipe = group(condition("playcount", "gte", NOT_MUCH))
        start, end = window_bounds(A_YEAR_AGO, at)
        month_tracks = await get_window_tracks(db, user_id, start, end)
        result = await run(at, A_YEAR_AGO, filters=recipe)
        chain = {
            "label": month_label(start.date()),
            "start": start.date().isoformat(),
            "end": end.date().isoformat(),
            "listens": sum(t["playcount"] for t in month_tracks),
            "plays": sorted((t["playcount"] for t in month_tracks), reverse=True),
            "kept": result["after_filter"],
            "size": result["total"],
            "top": shown(keep(result["tracks"])),
            "covers": await playlist_covers(keep(result["tracks"])),
        }

        runs = []
        for offset in range(1, RUNS + 1):
            year, month = (2026, 11 + offset) if 11 + offset <= 12 else (2027, 11 + offset - 12)
            when = datetime(year, month, 1, tzinfo=zone)
            made = await run(when, A_YEAR_AGO, filters=recipe)
            period_start, _ = window_bounds(A_YEAR_AGO, when)
            runs.append({
                "at": when.strftime("%b 1"),
                "period": period_start.strftime("%b %Y"),
                "size": made["total"],
                "covers": await playlist_covers(keep(made["tracks"])),
            })

        # Most played first: the discoveries that stuck, rather than three tracks heard once.
        discoveries = await run(at, MONTH, filters=group(condition("first_played", "within_days", 31)))
        summer_at = datetime(2026, 9, 1, tzinfo=zone)
        summer = await run(summer_at, SEASON)
        moment = {"fromDay": 5, "toDay": 5, "fromHour": 22, "toHour": 2}
        friday = await run(at, SEASON, filters=group(condition("listening_moment", "gte", 1, moment=moment)), size=30, sort_counts="moment")

        new_by_day = await rows(
            db,
            """select coalesce(c, 0) from generate_series(cast(:a as date), cast(:b as date), '1 day') g
               left join (select date_trunc('day', f) d, count(*) c from (select min(played_at) f from scrobbles where user_id = :u group by track_id) m group by 1) x
               on x.d = g order by g""",
            a=date(2025, 11, 1), b=date(2026, 10, 31), u=user_id,
        )
        summer_days = await rows(
            db,
            """select coalesce(c, 0) from generate_series(cast(:a as date), cast(:b as date), '1 day') g
               left join (select date_trunc('day', played_at) d, count(*) c from scrobbles where user_id = :u group by 1) x on x.d = g order by g""",
            a=date(2026, 6, 1), b=date(2026, 8, 31), u=user_id,
        )
        by_hour = await rows(
            db,
            """select coalesce(c, 0) from generate_series(0, 167) h left join (
                 select (extract(isodow from played_at at time zone :z)::int - 1) * 24 + extract(hour from played_at at time zone :z)::int k, count(*) c
                 from scrobbles where user_id = :u and played_at >= cast(:a as timestamptz) group by 1) x on x.k = h order by h""",
            z=timezone, u=user_id, a=datetime(2026, 8, 1, tzinfo=UTC),
        )

        def recipe_entry(name: str, sentence: str, made: dict, series) -> dict:
            return {"name": name, "sentence": sentence, "size": made["total"], "of": made["before_filter"], "top": shown(keep(made["tracks"]), 3), "shape": resample([r[0] for r in series])}

        demo = {
            "asOf": datetime.now(UTC).date().isoformat(),
            "name": OWNER_NAME,
            "total": total,
            "since": month_label(SINCE),
            "first": SINCE.isoformat(),
            "weeks": weeks,
            "covers": covers,
            "chain": chain,
            "runs": runs,
            "recipes": [
                recipe_entry("Discoveries of the month", "On the 1st of each month, the tracks first heard in the month before, most played first.", discoveries, new_by_day),
                recipe_entry("Seasonal", "At each change of season, what was played most during the one that ended.", summer, summer_days),
                recipe_entry("Friday nights", "Most played on Friday nights, 10pm to 2am, over the last 3 months.", friday, by_hour),
            ],
        }
        await db.rollback()

    with open(out, "w", encoding="utf-8") as file:
        json.dump(demo, file, ensure_ascii=False, separators=(",", ":"))
        file.write("\n")
    print(f"{out}: {total} listens since {demo['since']}")
    print(f"chain {chain['label']}: {chain['listens']} listens, {len(chain['plays'])} tracks, {chain['kept']} kept, {chain['size']} in the playlist, {len(chain['covers'])} covers")
    print("artists named:", sorted({t["artist"] for t in chain["top"]} | {t["artist"] for r in demo["recipes"] for t in r["top"]}))
    print("covers along the years:", len(covers), "| runs:", [(r["at"], r["period"], r["size"], len(r["covers"])) for r in runs])
    print("recipes:", [(r["name"], r["size"], r["of"]) for r in demo["recipes"]])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out")
    parser.add_argument("--skip-artist", action="append", default=[])
    arguments = parser.parse_args()
    asyncio.run(main(arguments.out, set(arguments.skip_artist)))
