"""Tests for typed, server-side validation of the automation filter tree.

Covers:
- create -> read round-trips the full nested filter tree losslessly
- malformed filter trees (unknown field / impossible value type) are rejected
  with 422 (proving server-side validation)
- PATCH updates filter_groups
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import delete

from .conftest import (
    _TestSessionLocal,
    _cleanup_user,
    _get_user_id_from_cookies,
    _unique_email,
)
from models.automation import Automation


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account (mocked get_user_info)."""
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert reg.status_code == 201
    client.cookies.clear()
    login = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert login.status_code == 200
    mock_info = {"username": "filter_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "filter_user"},
        )
    assert link.status_code == 200


async def _cleanup_user_with_automations(client: AsyncClient, email: str) -> None:
    """Delete the user's automations first (FK) then the user."""
    user_id = _get_user_id_from_cookies(client)
    async with _TestSessionLocal() as db:
        await db.execute(delete(Automation).where(Automation.user_id == user_id))
        await db.commit()
    await _cleanup_user(email=email)


def _create_body(filter_groups: list) -> dict:
    return {
        "name": "Filtered playlist",
        "description": "test",
        "source": {"type": "top_tracks", "period": "3m"},
        "cron": "",
        "filter_groups": filter_groups,
        "output": {"maxSize": 50},
        "enabled": True,
    }


def _mixed_tree() -> list:
    """A realistic mixed tree: top groups with AND/OR, nested groups, and
    conditions exercising tags/countMin/between/boolean/date operators."""
    return [
        {
            "id": "g1",
            "logic": "AND",
            "conditions": [
                {
                    "id": "c1",
                    "field": "userplaycount",
                    "operator": "gte",
                    "value": 10,
                    "valueMax": None,
                    "countMin": 0,
                    "tagSource": "artist",
                },
                {
                    "id": "c2",
                    "field": "tags",
                    "operator": "contains",
                    "value": "rock",
                    "valueMax": None,
                    "countMin": 50,
                    "tagSource": "artist",
                },
            ],
            "groups": [
                {
                    "id": "g1a",
                    "logic": "OR",
                    "conditions": [
                        {
                            "id": "c3",
                            "field": "userloved",
                            "operator": "is",
                            "value": True,
                            "valueMax": None,
                            "countMin": 0,
                            "tagSource": "artist",
                        },
                        {
                            "id": "c4",
                            "field": "playcount",
                            "operator": "between",
                            "value": 0,
                            "valueMax": 20,
                            "countMin": 0,
                            "tagSource": "artist",
                        },
                    ],
                    "groups": [],
                }
            ],
        },
        {
            "id": "g2",
            "logic": "OR",
            "conditions": [
                {
                    "id": "c5",
                    "field": "timestamp",
                    "operator": "within_days",
                    "value": 7,
                    "valueMax": None,
                    "countMin": 0,
                    "tagSource": "artist",
                }
            ],
            "groups": [],
        },
    ]


@pytest.mark.asyncio
async def test_create_automation_persists_nested_filter_tree(client: AsyncClient):
    """A nested filter tree must round-trip create -> read losslessly."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tree = _mixed_tree()
        resp = await client.post("/api/automations", json=_create_body(tree))
        assert resp.status_code == 201
        created = resp.json()
        assert created["filter_groups"] == tree

        automation_id = created["id"]
        got = await client.get(f"/api/automations/{automation_id}")
        assert got.status_code == 200
        assert got.json()["filter_groups"] == tree
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_invalid_filter_tree_rejected_422(client: AsyncClient):
    """A condition with an unknown field must be rejected with 422."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        bad_tree = [
            {
                "id": "g1",
                "logic": "AND",
                "conditions": [
                    {
                        "id": "c1",
                        "field": "bogus_field",
                        "operator": "gte",
                        "value": 5,
                        "valueMax": None,
                        "countMin": 0,
                        "tagSource": "artist",
                    }
                ],
                "groups": [],
            }
        ]
        resp = await client.post("/api/automations", json=_create_body(bad_tree))
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_invalid_condition_value_type_rejected_422(client: AsyncClient):
    """A condition whose value is an impossible type must be rejected with 422."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        bad_tree = [
            {
                "id": "g1",
                "logic": "AND",
                "conditions": [
                    {
                        "id": "c1",
                        "field": "userplaycount",
                        "operator": "gte",
                        "value": {"nested": True},
                        "valueMax": None,
                        "countMin": 0,
                        "tagSource": "artist",
                    }
                ],
                "groups": [],
            }
        ]
        resp = await client.post("/api/automations", json=_create_body(bad_tree))
        assert resp.status_code == 422
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_update_automation_filter_groups(client: AsyncClient):
    """PATCH with new filter_groups must persist and return the updated tree."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post(
            "/api/automations", json=_create_body(_mixed_tree())
        )
        assert created.status_code == 201
        automation_id = created.json()["id"]

        new_tree = [
            {
                "id": "g9",
                "logic": "AND",
                "conditions": [
                    {
                        "id": "c9",
                        "field": "listeners",
                        "operator": "gt",
                        "value": 1000,
                        "valueMax": None,
                        "countMin": 0,
                        "tagSource": "artist",
                    }
                ],
                "groups": [],
            }
        ]
        resp = await client.patch(
            f"/api/automations/{automation_id}",
            json={"filter_groups": new_tree},
        )
        assert resp.status_code == 200
        assert resp.json()["filter_groups"] == new_tree
    finally:
        await _cleanup_user_with_automations(client, email)