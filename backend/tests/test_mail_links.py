"""Links by mail: a forgotten password, a new confirmation, sign-ups nobody confirmed, and the sending itself."""
import smtplib
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from config import get_settings
from httpx import AsyncClient
from models.mail_link import MailLink
from models.user import User
from repositories.users import purge_unconfirmed_signups
from services import mailer
from sqlalchemy import select, update

from .conftest import (
    SENT_MAILS,
    _register_and_login,
    _TestSessionLocal,
    _unique_email,
    mailed_token,
)

PASSWORD = "StrongP@ss1!"


@pytest.mark.asyncio
async def test_a_forgotten_password_is_reset_from_the_mailed_link(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    other_device = client.cookies.get("refresh_token")
    client.cookies.clear()

    asked = await client.post("/api/auth/password/forgot", json={"email": email})
    assert asked.status_code == 202
    to, subject, body = SENT_MAILS[-1]
    assert to == email and "Reset" in subject and "/reset-password?token=" in body

    reset = await client.post("/api/auth/password/reset", json={"token": mailed_token(email), "password": "Another-P@ss2"})
    assert reset.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200
    # Every other device is signed out.
    client.cookies.clear()
    assert (await client.post("/api/auth/refresh", cookies={"refresh_token": other_device})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": "Another-P@ss2"})).status_code == 200


@pytest.mark.asyncio
async def test_asking_for_a_link_tells_nobody_who_has_an_account(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    client.cookies.clear()
    known = await client.post("/api/auth/password/forgot", json={"email": email})
    unknown = await client.post("/api/auth/password/forgot", json={"email": _unique_email()})
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    assert [to for to, _, _ in SENT_MAILS].count(email) == 2  # the confirmation, then the reset


@pytest.mark.asyncio
async def test_a_reset_link_expires_and_works_once(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    await client.post("/api/auth/password/forgot", json={"email": email})
    token = mailed_token(email)
    async with _TestSessionLocal() as db:
        await db.execute(update(MailLink).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    expired = await client.post("/api/auth/password/reset", json={"token": token, "password": "Another-P@ss2"})
    assert expired.status_code == 400
    assert (await client.post("/api/auth/password/reset", json={"token": token, "password": "Another-P@ss2"})).status_code == 400
    # A confirmation link doesn't reset a password.
    await client.post("/api/auth/register", json={"email": (fresh := _unique_email()), "password": PASSWORD})
    assert (await client.post("/api/auth/password/reset", json={"token": mailed_token(fresh), "password": "Another-P@ss2"})).status_code == 400


@pytest.mark.asyncio
async def test_a_new_confirmation_link_replaces_the_old_one(client: AsyncClient):
    email = _unique_email()
    await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    first = mailed_token(email)
    assert (await client.post("/api/auth/confirm/resend", json={"email": email})).status_code == 202
    second = mailed_token(email)
    assert first != second
    assert (await client.post("/api/auth/confirm", json={"token": first})).status_code == 400
    assert (await client.post("/api/auth/confirm", json={"token": second})).status_code == 200
    # Confirmed: nothing more is sent.
    sent = len(SENT_MAILS)
    assert (await client.post("/api/auth/confirm/resend", json={"email": email})).status_code == 202
    assert len(SENT_MAILS) == sent


@pytest.mark.asyncio
async def test_sign_ups_nobody_confirmed_go_after_a_week(client: AsyncClient):
    stale, fresh, kept = _unique_email(), _unique_email(), _unique_email()
    for email in (stale, fresh):
        await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    await _register_and_login(client, kept)
    async with _TestSessionLocal() as db:
        await db.execute(update(User).where(User.email.in_([stale, kept])).values(created_at=datetime.now(UTC) - timedelta(days=8)))
        await db.commit()
        assert await purge_unconfirmed_signups(db, timedelta(days=7)) == 1
        await db.commit()
        left = set((await db.execute(select(User.email))).scalars())
    assert stale not in left and {fresh, kept} <= left


@pytest.mark.asyncio
async def test_an_added_address_gets_a_confirmation_link(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    async with _TestSessionLocal() as db:
        await db.execute(update(User).where(User.email == email).values(email=None))
        await db.commit()
    added = _unique_email()
    assert (await client.post("/api/auth/oauth/complete-email", json={"email": added})).status_code == 200
    assert SENT_MAILS[-1][0] == added
    assert (await client.post("/api/auth/confirm", json={"token": mailed_token(added)})).status_code == 200
    async with _TestSessionLocal() as db:
        assert (await db.execute(select(User.email_verified).where(User.email == added))).scalar_one() is True


@pytest.mark.asyncio
async def test_without_smtp_a_local_setup_prints_the_mail_and_production_refuses(monkeypatch, capsys):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "")
    assert await mailer.send_mail("a@b.example", "Hi", "the link\n") is True
    assert "the link" in capsys.readouterr().out
    monkeypatch.setattr(settings, "cookie_secure", True)
    assert await mailer.send_mail("a@b.example", "Hi", "the link\n") is False
    assert "the link" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_a_mail_that_cannot_leave_is_reported_not_raised(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example")
    sent = []
    with patch("services.mailer.smtplib.SMTP_SSL") as smtp:
        smtp.return_value.__enter__.return_value.send_message.side_effect = sent.append
        assert await mailer.send_mail("a@b.example", "Hi", "body") is True
        assert sent[0]["To"] == "a@b.example" and sent[0]["From"] == settings.mail_from
        smtp.side_effect = smtplib.SMTPConnectError(421, "busy")
        assert await mailer.send_mail("a@b.example", "Hi", "body") is False
