import time
import uuid

import pytest
from httpx import AsyncClient
from services.rate_limit import (
    DUPLICATE_EMAIL_MESSAGE,
    RateLimiter,
    register_email_limiter,
    register_limiter,
)

from .conftest import SENT_MAILS, _cleanup_user, _unique_email, mailed_token, signup


@pytest.mark.asyncio
async def test_register_mails_a_link_and_opens_nothing_until_it_is_followed(client: AsyncClient):
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!", "display_name": "Test"},
        )
        assert resp.status_code == 201
        assert "link" in resp.json()["detail"]
        assert "password" not in resp.text
        assert client.cookies.get("access_token") is None
        to, subject, body = SENT_MAILS[-1]
        assert to == email and "Confirm" in subject and "/confirm-email?token=" in body

        login = await client.post("/api/auth/login", json={"email": email, "password": "StrongP@ss1!"})
        assert login.status_code == 403

        confirmed = await client.post("/api/auth/confirm", json={"token": mailed_token(email)})
        assert confirmed.status_code == 200
        auth_cookies = [h for h in confirmed.headers.get_list("set-cookie") if "access_token" in h or "refresh_token" in h]
        assert len(auth_cookies) == 2 and all("httponly" in h.lower() for h in auth_cookies)
        assert (await client.get("/api/auth/me")).json()["email"] == email
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_a_link_works_once(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post("/api/auth/register", json={"email": email, "password": "StrongP@ss1!"})
        token = mailed_token(email)
        assert (await client.post("/api/auth/confirm", json={"token": token})).status_code == 200
        client.cookies.clear()
        again = await client.post("/api/auth/confirm", json={"token": token})
        assert again.status_code == 400
        assert client.cookies.get("access_token") is None
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    email = _unique_email()
    try:
        assert (await signup(client, email)).status_code == 201
        client.cookies.clear()
        resp2 = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 409
        # Byte-identical to the shared constant so the response body does not
        # reveal whether the email exists (anti-enumeration).
        assert resp2.json()["detail"] == DUPLICATE_EMAIL_MESSAGE
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_an_unconfirmed_sign_up_gives_its_address_to_whoever_opens_the_mailbox(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post("/api/auth/register", json={"email": email, "password": "Squatter-123"})
        squatter_link = mailed_token(email)
        assert (await client.post("/api/auth/register", json={"email": email, "password": "Owner-12345"})).status_code == 201
        assert (await client.post("/api/auth/confirm", json={"token": squatter_link})).status_code == 400
        assert (await client.post("/api/auth/confirm", json={"token": mailed_token(email)})).status_code == 200
        client.cookies.clear()
        assert (await client.post("/api/auth/login", json={"email": email, "password": "Squatter-123"})).status_code == 401
        assert (await client.post("/api/auth/login", json={"email": email, "password": "Owner-12345"})).status_code == 200
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_email_limiter_429_same_email(client: AsyncClient):
    """The per-email register limiter throttles the 4th attempt for the same
    email even after the IP limiter is reset (attacker rotating IPs but
    reusing the same victim email): each try mails the victim."""
    email_a = _unique_email()
    email_b = _unique_email()
    password = "StrongP@ss1!"
    try:
        statuses = []
        for _ in range(3):
            resp = await client.post(
                "/api/auth/register",
                json={"email": email_a, "password": password},
            )
            statuses.append(resp.status_code)
        # Unconfirmed, each one replaces the last.
        assert statuses == [201, 201, 201]

        # Reset ONLY the IP limiter — simulates the attacker changing IP.
        register_limiter.reset()

        resp4 = await client.post(
            "/api/auth/register",
            json={"email": email_a, "password": password},
        )
        assert resp4.status_code == 429

        # A different email from the same IP is not throttled — proves the
        # limiter is keyed per-email, not globally.
        resp_b = await client.post(
            "/api/auth/register",
            json={"email": email_b, "password": password},
        )
        assert resp_b.status_code == 201
    finally:
        await _cleanup_user(email=email_a)
        await _cleanup_user(email=email_b)
        register_limiter.reset()
        register_email_limiter.reset()


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient):
    resp = await client.post(
        "/api/auth/register",
        json={"email": _unique_email(), "password": "short"},
    )
    assert resp.status_code == 422
    assert "at least 8 characters" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_password_over_72_bytes_422(client: AsyncClient):
    """bcrypt caps at 72 BYTES — a 73-char ASCII password must be rejected
    instead of silently truncated."""
    resp = await client.post(
        "/api/auth/register",
        json={"email": _unique_email(), "password": "a" * 73},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_password_multibyte_72_bytes_ok(client: AsyncClient):
    """36 emoji chars = 144 bytes (4 bytes each) — rejected even though only
    36 characters, proving the limit counts bytes, not characters."""
    resp = await client.post(
        "/api/auth/register",
        json={"email": _unique_email(), "password": "\U0001F600" * 36},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_email_normalized(client: AsyncClient):
    raw_email = f"  Test-{uuid.uuid4().hex[:8]}@Example.COM  "
    normalized = raw_email.strip().lower()
    try:
        resp = await client.post("/api/auth/register", json={"email": raw_email, "password": "StrongP@ss1!"})
        assert resp.status_code == 201
        assert SENT_MAILS[-1][0] == normalized
        assert (await client.post("/api/auth/confirm", json={"token": mailed_token(normalized)})).status_code == 200

        resp2 = await client.post(
            "/api/auth/register",
            json={"email": normalized, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 409
    finally:
        await _cleanup_user(email=normalized)


def test_rate_limiter_evicts_expired_keys():
    """A key whose hits all fall outside the window is evicted so the limiter
    does not accumulate unlimited in-memory keys."""
    limiter = RateLimiter(max_requests=100, window_seconds=60)
    key = f"key-{uuid.uuid4().hex}"
    old = time.monotonic() - 120
    limiter._requests[key] = [old]
    limiter._clean(key, time.monotonic())
    assert key not in limiter._requests

    limiter.check(key)
    limiter.check("other")
    assert key in limiter._requests or limiter._checks_since_sweep > 0
