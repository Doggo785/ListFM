"""The landing page's public route: what it answers, and what keeps it from costing the signed-in users their syncs."""

from datetime import UTC, datetime
from unittest.mock import patch

import httpx
import pylast
import pytest
from httpx import AsyncClient
from routers.public import forget_listeners, same_month_a_year_ago
from services.rate_limit import listener_limiter, listener_total_limiter

URL = "/api/public/listener"
TRACKS = [{"artist": "Disiz", "title": "melodrama", "plays": 77}]


@pytest.fixture(autouse=True)
def forget_after_each_test():
    forget_listeners()
    yield
    forget_listeners()


def glimpse(**kwargs):
    return patch("routers.public.get_listener_glimpse", **kwargs)


@pytest.mark.asyncio
async def test_shows_the_artist_and_the_tracks(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)) as called:
        resp = await client.post(URL, json={"username": " Doggo785 "})
    assert resp.status_code == 200
    body = resp.json()
    assert body["artist"] == "Disiz"
    assert body["tracks"] == TRACKS
    assert body["month"].endswith(str(datetime.now(UTC).year - 1))
    assert called.call_args.args[0] == "Doggo785"


@pytest.mark.asyncio
async def test_a_profile_with_nothing_yet_is_an_answer(client: AsyncClient):
    with glimpse(return_value=(None, [])):
        resp = await client.post(URL, json={"username": "newcomer"})
    assert resp.status_code == 200
    assert resp.json()["artist"] is None


@pytest.mark.asyncio
async def test_the_same_name_is_asked_of_lastfm_once(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)) as called:
        await client.post(URL, json={"username": "doggo"})
        resp = await client.post(URL, json={"username": "DOGGO"})
    assert resp.json()["artist"] == "Disiz"
    assert called.call_count == 1


@pytest.mark.asyncio
async def test_the_oldest_name_makes_room_for_a_new_one(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)) as called, patch("routers.public.REMEMBERED", 1):
        await client.post(URL, json={"username": "first"})
        await client.post(URL, json={"username": "second"})
        await client.post(URL, json={"username": "first"})
    assert called.call_count == 3


@pytest.mark.asyncio
async def test_a_memory_ends(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)) as called, patch("routers.public.REMEMBER_SECONDS", -1):
        await client.post(URL, json={"username": "doggo"})
        await client.post(URL, json={"username": "doggo"})
    assert called.call_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["a", "two words", "a" * 33, "../etc", "é€"])
async def test_a_name_that_cant_exist_costs_no_call(client: AsyncClient, name):
    with glimpse() as called:
        resp = await client.post(URL, json={"username": name})
    assert resp.status_code == 404
    assert "can't find" in resp.json()["detail"]
    called.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "status", "words"),
    [
        (pylast.WSError(None, "6", "User not found"), 404, "can't find"),
        (pylast.WSError(None, "17", "Login required"), 403, "private"),
        (pylast.WSError(None, "29", "Rate limit"), 503, "busy"),
        (pylast.WSError(None, "11", "Service offline"), 503, "isn't answering"),
        (httpx.ConnectError("https://ws.audioscrobbler.com/?api_key=SECRET"), 503, "isn't answering"),
    ],
)
async def test_says_what_went_wrong_without_the_error_itself(client: AsyncClient, error, status, words):
    with glimpse(side_effect=error), patch("routers.public.note_rate_limited") as backed_off:
        resp = await client.post(URL, json={"username": "doggo"})
    assert resp.status_code == status
    assert words in resp.json()["detail"]
    assert "SECRET" not in resp.text
    assert backed_off.called == (status == 503 and words == "busy")


@pytest.mark.asyncio
async def test_a_failure_is_not_remembered(client: AsyncClient):
    with glimpse(side_effect=httpx.ConnectError("down")):
        await client.post(URL, json={"username": "doggo"})
    with glimpse(return_value=("Disiz", TRACKS)):
        resp = await client.post(URL, json={"username": "doggo"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_one_visitor_is_limited(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)):
        answers = [await client.post(URL, json={"username": f"name{i}"}) for i in range(listener_limiter.max_requests + 1)]
    assert answers[-2].status_code == 200
    assert answers[-1].status_code == 429


@pytest.mark.asyncio
async def test_the_whole_site_is_limited_and_says_so(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)) as called:
        for i in range(listener_total_limiter.max_requests):
            listener_limiter.reset()
            await client.post(URL, json={"username": f"name{i}"})
        listener_limiter.reset()
        resp = await client.post(URL, json={"username": "onetoomany"})
    assert resp.status_code == 503
    assert "busy" in resp.json()["detail"]
    assert called.call_count == listener_total_limiter.max_requests


@pytest.mark.asyncio
async def test_a_remembered_name_passes_even_when_the_site_is_full(client: AsyncClient):
    with glimpse(return_value=("Disiz", TRACKS)):
        await client.post(URL, json={"username": "doggo"})
        for _ in range(listener_total_limiter.max_requests - 1):
            listener_total_limiter.check("all")
        resp = await client.post(URL, json={"username": "doggo"})
    assert resp.status_code == 200


def test_same_month_a_year_ago_crosses_the_new_year():
    assert same_month_a_year_ago(datetime(2026, 12, 15, tzinfo=UTC)) == (datetime(2025, 12, 1, tzinfo=UTC), datetime(2026, 1, 1, tzinfo=UTC))
    assert same_month_a_year_ago(datetime(2026, 2, 28, tzinfo=UTC)) == (datetime(2025, 2, 1, tzinfo=UTC), datetime(2025, 3, 1, tzinfo=UTC))


def test_lastfm_is_asked_twice_and_its_answer_is_read(monkeypatch):
    from services import lastfm

    asked = []

    def fake(method, **params):
        asked.append((method, params))
        if method == "user.getTopArtists":
            return {"topartists": {"artist": {"name": "Disiz"}}}
        track = {"artist": {"#text": "Disiz"}, "name": "melodrama", "playcount": "77"}
        return {"weeklytrackchart": {"track": [track] * 8}}

    monkeypatch.setattr(lastfm, "_lastfm_json", fake)
    monkeypatch.setattr(lastfm, "LASTFM_MIN_INTERVAL", 0)
    artist, tracks = lastfm.get_listener_glimpse("doggo", 1, 2)
    assert artist == "Disiz"
    assert tracks == [{"artist": "Disiz", "title": "melodrama", "plays": 77}] * lastfm.LISTENER_TRACKS
    assert [method for method, _ in asked] == ["user.getTopArtists", "user.getWeeklyTrackChart"]
    assert asked[1][1]["from"] == "1"
    assert asked[1][1]["to"] == "2"
