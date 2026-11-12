"""What keeps one account from wearing out the home server, and what the outside can see of the API."""
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.user import User
from repositories.generated_playlists import prune_automation_playlists
from routers.automations import MAX_AUTOMATIONS
from sqlalchemy import func, select

from .conftest import _register_and_login, _TestSessionLocal, _unique_email, link_lastfm
from .test_automation_scheduler import _create_body

WINDOW = {"length": {"amount": 3, "unit": "month"}}


@pytest.mark.asyncio
async def test_an_account_keeps_a_bounded_number_of_automations(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    await link_lastfm(client, "busy")
    async with _TestSessionLocal() as db:
        user_id = (await db.execute(select(User.id))).scalars().one()
        db.add_all(Automation(id=f"a{i}", user_id=user_id, lastfm_username="busy", name=str(i), window=WINDOW, sort="random") for i in range(MAX_AUTOMATIONS))
        await db.commit()
    full = await client.post("/api/automations", json=_create_body())
    assert full.status_code == 409
    assert str(MAX_AUTOMATIONS) in full.json()["detail"]
    assert (await client.delete("/api/automations/a0")).status_code == 204
    assert (await client.post("/api/automations", json=_create_body())).status_code == 201


@pytest.mark.asyncio
async def test_a_schedule_runs_at_most_once_a_day(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    await link_lastfm(client, "eager")
    resp = await client.post("/api/automations", json={**_create_body(), "cron": "*/5 * * * *"})
    assert resp.status_code == 422
    assert "once a day" in resp.text


@pytest.mark.asyncio
async def test_only_the_newest_playlists_of_an_automation_stay(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    start = datetime(2026, 1, 1, tzinfo=UTC)
    async with _TestSessionLocal() as db:
        user_id = (await db.execute(select(User.id))).scalars().one()
        db.add(Automation(id="a1", user_id=user_id, lastfm_username="x", name="Daily", window=WINDOW, sort="random"))
        await db.flush()
        for day in range(5):
            at = start + timedelta(days=day)
            db.add(GeneratedPlaylist(id=f"p{day}", user_id=user_id, automation_id="a1", lastfm_username="x", track_count=0, generated_at=at, deleted_at=at if day == 1 else None))
        await db.flush()
        db.add(AutomationHistory(id="h0", automation_id="a1", generated_playlist_id="p0", status="completed", scheduled_for=start, started_at=start))
        await prune_automation_playlists(db, "a1", keep=3)
        await db.commit()
        kept = (await db.execute(select(GeneratedPlaylist.id).order_by(GeneratedPlaylist.id))).scalars().all()
        assert kept == ["p2", "p3", "p4"]
        run = await db.get(AutomationHistory, "h0")
        assert run is not None and run.generated_playlist_id is None
        assert await db.scalar(select(func.count()).select_from(AutomationHistory)) == 1


@pytest.mark.asyncio
async def test_health_answers_and_the_api_map_is_not_public(client: AsyncClient):
    assert (await client.get("/api/health")).json() == {"status": "ok"}
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert (await client.get(path)).status_code == 404
