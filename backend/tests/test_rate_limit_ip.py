import pytest
from config import get_settings
from httpx import AsyncClient

from .conftest import _register_and_login, _unique_email

PASSWORD = "StrongP@ss1!"


async def _register(client: AsyncClient, headers: dict | None = None) -> int:
    resp = await client.post("/api/auth/register", json={"email": _unique_email(), "password": PASSWORD}, headers=headers or {})
    client.cookies.clear()
    return resp.status_code


@pytest.mark.asyncio
async def test_a_forged_x_forwarded_for_does_not_reset_the_limit(client: AsyncClient):
    # The 3-per-6-hours register budget, spent with a new fake address each time.
    for i in range(3):
        assert await _register(client, {"X-Forwarded-For": f"1.2.3.{i}"}) == 201
    assert await _register(client, {"X-Forwarded-For": "9.9.9.9"}) == 429


@pytest.mark.asyncio
async def test_the_proxy_header_names_the_visitor(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "trusted_ip_header", "CF-Connecting-IP")
    for _ in range(3):
        assert await _register(client, {"CF-Connecting-IP": "1.2.3.4"}) == 201
    assert await _register(client, {"CF-Connecting-IP": "1.2.3.4"}) == 429
    assert await _register(client, {"CF-Connecting-IP": "5.6.7.8"}) == 201


@pytest.mark.asyncio
async def test_wrong_passwords_lock_the_account_whatever_the_address(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "trusted_ip_header", "CF-Connecting-IP")
    email = _unique_email()
    await _register_and_login(client, email)
    client.cookies.clear()
    for i in range(20):
        wrong = await client.post("/api/auth/login", json={"email": email, "password": "Wrong-1234"}, headers={"CF-Connecting-IP": f"10.0.0.{i}"})
        assert wrong.status_code == 401
    # Even the right password waits now: a 200 would confirm a guess.
    right = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD}, headers={"CF-Connecting-IP": "10.0.1.1"})
    assert right.status_code == 429
