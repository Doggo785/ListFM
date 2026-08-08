import pytest
from httpx import AsyncClient

from services.rate_limit import register_limiter

from .conftest import _cleanup_user, _unique_email


@pytest.mark.asyncio
async def test_rate_limit_honors_x_forwarded_for(client: AsyncClient):
    """Requests from the same X-Forwarded-For IP share one bucket even though
    the socket peer is always 127.0.0.1; a different XFF IP gets its own
    bucket (proves the limiter keys on the XFF first IP, not client.host)."""
    emails = [_unique_email() for _ in range(4)]
    try:
        # Burn the 3-request register_limiter budget on XFF 1.2.3.4.
        for email in emails[:3]:
            resp = await client.post(
                "/api/auth/register",
                json={"email": email, "password": "StrongP@ss1!"},
                headers={"X-Forwarded-For": "1.2.3.4"},
            )
            assert resp.status_code == 201

        # A different XFF IP is NOT throttled — buckets are per-XFF-IP, not
        # per socket client (127.0.0.1).
        resp_other = await client.post(
            "/api/auth/register",
            json={"email": emails[3], "password": "StrongP@ss1!"},
            headers={"X-Forwarded-For": "5.6.7.8"},
        )
        assert resp_other.status_code == 201

        # 4th request from the same XFF IP hits the limit.
        resp4 = await client.post(
            "/api/auth/register",
            json={"email": _unique_email(), "password": "StrongP@ss1!"},
            headers={"X-Forwarded-For": "1.2.3.4"},
        )
        assert resp4.status_code == 429
    finally:
        for email in emails:
            await _cleanup_user(email=email)
        register_limiter.reset()


@pytest.mark.asyncio
async def test_rate_limit_falls_back_to_client_host(client: AsyncClient):
    """Without X-Forwarded-For the limiter keys on the socket client IP —
    existing behavior preserved."""
    emails = [_unique_email() for _ in range(3)]
    try:
        for email in emails:
            resp = await client.post(
                "/api/auth/register",
                json={"email": email, "password": "StrongP@ss1!"},
            )
            assert resp.status_code == 201

        # 4th request from the same socket client hits the limit.
        resp4 = await client.post(
            "/api/auth/register",
            json={"email": _unique_email(), "password": "StrongP@ss1!"},
        )
        assert resp4.status_code == 429
    finally:
        for email in emails:
            await _cleanup_user(email=email)
        register_limiter.reset()