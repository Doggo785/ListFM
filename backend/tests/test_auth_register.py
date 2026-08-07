import uuid

import pytest
from httpx import AsyncClient

from services.rate_limit import (
    DUPLICATE_EMAIL_MESSAGE,
    register_email_limiter,
    register_limiter,
)

from .conftest import _cleanup_user, _unique_email


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!", "display_name": "Test"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert "access_token" in data
        assert "refresh_token" in data
        assert "expires_in" in data
        assert "password_hash" not in data
        assert "password" not in data
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_sets_http_only_cookies(client: AsyncClient):
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 201
        set_cookie_headers = resp.headers.get_list("set-cookie")
        auth_cookies = [
            h for h in set_cookie_headers
            if "access_token" in h.lower() or "refresh_token" in h.lower()
        ]
        assert len(auth_cookies) >= 2, "Expected both access_token and refresh_token cookies"
        for header in auth_cookies:
            assert "httponly" in header.lower(), f"Cookie not httponly: {header}"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    email = _unique_email()
    try:
        resp1 = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp1.status_code == 201

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
async def test_register_email_limiter_429_same_email(client: AsyncClient):
    """The per-email register limiter throttles the 4th attempt for the same
    email even after the IP limiter is reset (attacker rotating IPs but
    reusing the same victim email)."""
    email_a = _unique_email()
    email_b = _unique_email()
    password = "StrongP@ss1!"
    try:
        # Burn 3 requests on the same email (1 success + 2 duplicates).
        statuses = []
        for _ in range(3):
            resp = await client.post(
                "/api/auth/register",
                json={"email": email_a, "password": password},
            )
            statuses.append(resp.status_code)
        assert statuses == [201, 409, 409]

        # Reset ONLY the IP limiter — simulates the attacker changing IP.
        register_limiter.reset()

        # 4th attempt on the same email is throttled by the per-email limiter.
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
async def test_register_email_normalized(client: AsyncClient):
    raw_email = f"  Test-{uuid.uuid4().hex[:8]}@Example.COM  "
    normalized = raw_email.strip().lower()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": raw_email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 201

        resp2 = await client.post(
            "/api/auth/register",
            json={"email": normalized, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 409
    finally:
        await _cleanup_user(email=normalized)
