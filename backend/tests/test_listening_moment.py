"""listening_moment filter: days, hours, threshold, timezone, and what the sort counts."""

import uuid
from datetime import UTC, datetime

import pytest
from filter_types import ListeningMoment
from httpx import AsyncClient
from models.user import User
from repositories.scrobbles import store_scrobbles
from services.automation_runner import run_automation_pipeline_cached

from .conftest import _TestSessionLocal, _unique_email
from .test_automation_filters import _frontend_payload, _register_login_link

NOW = datetime(2026, 3, 31, 12, tzinfo=UTC)  # a Tuesday


def _utc(day, hour):
    """March 2026: the 2nd is a Monday, so day 2 + n is n days after Monday."""
    return datetime(2026, 3, day, hour, tzinfo=UTC)


async def _user(listens, timezone="UTC"):
    """listens: (title, played_at)."""
    user_id = str(uuid.uuid4())
    async with _TestSessionLocal() as db:
        db.add(User(id=user_id, email=_unique_email(), timezone=timezone, scrobbles_complete_at=NOW))
        await db.flush()
        await store_scrobbles(db, user_id, [(title, "A", played_at) for title, played_at in listens])
        await db.commit()
    return user_id


async def _run(user_id, *moments, min_plays=1, logic="AND", **options):
    conditions = [
        {"id": f"c{i}", "field": "listening_moment", "operator": "gte", "value": min_plays, "moment": moment}
        for i, moment in enumerate(moments)
    ]
    async with _TestSessionLocal() as db:
        result = await run_automation_pipeline_cached(
            db, user_id=user_id, username="u", window={"length": None}, sort="most_played",
            filter_groups=[{"id": "g", "logic": logic, "conditions": conditions}], max_tracks=10, at=NOW, **options,
        )
    return [t["title"] for t in result["tracks"]]


@pytest.mark.asyncio
async def test_days_and_hours():
    user_id = await _user(
        [
            ("monday noon", _utc(2, 12)),
            ("friday evening", _utc(6, 20)),
            ("saturday noon", _utc(7, 12)),
            ("sunday evening", _utc(8, 20)),
        ]
    )
    assert set(await _run(user_id, {"fromDay": 1, "toDay": 5})) == {"monday noon", "friday evening"}
    # A range that wraps: Saturday to Monday.
    assert set(await _run(user_id, {"fromDay": 6, "toDay": 1})) == {"monday noon", "saturday noon", "sunday evening"}
    assert set(await _run(user_id, {"fromHour": 18, "toHour": 23})) == {"friday evening", "sunday evening"}
    assert await _run(user_id, {"fromDay": 5, "toDay": 5, "fromHour": 18, "toHour": 23}) == ["friday evening"]


@pytest.mark.asyncio
async def test_a_night_belongs_to_the_day_it_began():
    user_id = await _user(
        [
            ("friday 23h", _utc(6, 23)),
            ("saturday 1h", _utc(7, 1)),
            ("saturday 2h", _utc(7, 2)),  # toHour is excluded
            ("friday 1h", _utc(6, 1)),  # still Thursday's night
        ]
    )
    friday_night = {"fromDay": 5, "toDay": 5, "fromHour": 22, "toHour": 2}
    assert set(await _run(user_id, friday_night)) == {"friday 23h", "saturday 1h"}
    assert set(await _run(user_id, {"fromHour": 22, "toHour": 2})) == {"friday 23h", "saturday 1h", "friday 1h"}


@pytest.mark.asyncio
async def test_hours_are_read_in_the_users_timezone():
    # 22:00 UTC on March 6 is 23:00 in Paris (UTC+1 on that date).
    listens = [("late", _utc(6, 22))]
    assert await _run(await _user(listens), {"fromHour": 22, "toHour": 23}) == ["late"]
    paris = await _user(listens, timezone="Europe/Paris")
    assert await _run(paris, {"fromHour": 22, "toHour": 23}) == []
    assert await _run(paris, {"fromHour": 23, "toHour": 0}) == ["late"]


@pytest.mark.asyncio
async def test_threshold_ignores_an_isolated_listen():
    user_id = await _user(
        [("once", _utc(6, 20)), ("twice", _utc(6, 20)), ("twice", _utc(7, 20)), ("day", _utc(6, 12))]
    )
    evening = {"fromHour": 18, "toHour": 23}
    assert set(await _run(user_id, evening)) == {"once", "twice"}
    assert await _run(user_id, evening, min_plays=2) == ["twice"]


@pytest.mark.asyncio
async def test_combines_with_or_and_each_condition_keeps_its_own_moment():
    user_id = await _user([("evening", _utc(6, 20)), ("morning", _utc(6, 8)), ("noon", _utc(6, 12))])
    evening = {"fromHour": 18, "toHour": 23}
    morning = {"fromHour": 6, "toHour": 10}
    assert set(await _run(user_id, evening, morning, logic="OR")) == {"evening", "morning"}
    assert await _run(user_id, evening, morning, logic="AND") == []


@pytest.mark.asyncio
async def test_sort_counts_the_window_or_the_moment():
    listens = [("day", _utc(day, 12)) for day in (2, 3, 4)] + [("day", _utc(2, 20))]
    listens += [("night", _utc(day, 20)) for day in (2, 3)]
    user_id = await _user(listens)
    evening = {"fromHour": 18, "toHour": 23}
    assert await _run(user_id, evening) == ["day", "night"]  # 4 listens against 2
    assert await _run(user_id, evening, sort_counts="moment") == ["night", "day"]  # 1 against 2


@pytest.mark.parametrize(
    "moment",
    [{}, {"fromDay": 1}, {"toHour": 3}, {"fromHour": 5, "toHour": 5}, {"fromDay": 0, "toDay": 3}, {"fromHour": 24, "toHour": 2}],
)
def test_invalid_moments_are_refused(moment):
    with pytest.raises(ValueError):
        ListeningMoment.model_validate(moment)


@pytest.mark.asyncio
async def test_api_round_trips_moments_and_sort_counts(client: AsyncClient):
    await _register_login_link(client, _unique_email())
    condition = {
        "id": "c", "field": "listening_moment", "operator": "gte", "value": 5,
        "moment": {"fromDay": 1, "toDay": 5, "fromHour": 22, "toHour": 2},
    }
    body = _frontend_payload([{"id": "g", "logic": "AND", "conditions": [condition], "groups": []}])
    body["sortCounts"] = "moment"
    created = await client.post("/api/automations", json=body)
    assert created.status_code == 201, created.text
    read = created.json()
    assert read["sortCounts"] == "moment"
    assert read["filterGroups"][0]["conditions"][0]["moment"] == condition["moment"]

    # Editing something else keeps the choice; the default is the window.
    patched = await client.patch(f"/api/automations/{read['id']}", json={"name": "renamed"})
    assert patched.json()["sortCounts"] == "moment"
    plain = await client.post("/api/automations", json=_frontend_payload([]))
    assert plain.json()["sortCounts"] == "window"

    condition.pop("moment")
    refused = _frontend_payload([{"id": "g", "conditions": [condition]}])
    assert (await client.post("/api/automations", json=refused)).status_code == 422
