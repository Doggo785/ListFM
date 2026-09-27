"""T2: global SQLAlchemyError handler returns clean JSON (no HTML, no leak)."""

from unittest.mock import MagicMock

from sqlalchemy.exc import SQLAlchemyError


async def test_sqlalchemy_handler_returns_json_500_without_leak():
    """Unhandled DB errors become generic JSON 500, never internals."""
    from backend.main import sqlalchemy_error_handler

    exc = SQLAlchemyError("secret table users password=xxx")
    resp = await sqlalchemy_error_handler(MagicMock(), exc)
    assert resp.status_code == 500
    body = resp.body.decode()
    assert "secret" not in body
    assert "password" not in body
    assert "detail" in body


def test_app_registers_sqlalchemy_handler():
    """App must route SQLAlchemyError to the JSON handler."""
    from backend.main import app

    assert SQLAlchemyError in app.exception_handlers
