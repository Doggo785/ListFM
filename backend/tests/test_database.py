"""T1: prod engine pool + get_db rollback."""

from unittest.mock import AsyncMock

import database


def test_engine_has_pool_pre_ping():
    """Prod engine must ping pooled connections (survives PG restart)."""
    assert database.engine.pool._pre_ping is True


def test_engine_has_pool_timeouts():
    """Prod engine must bound pool waits instead of hanging forever."""
    assert database.engine.pool._timeout == 30
    assert database.engine.pool._recycle == 1800


async def test_get_db_rolls_back_on_error():
    """get_db must rollback the session when the request fails."""
    real_session_factory = database.async_session
    mock_session = AsyncMock()
    mock_session.__aenter__.return_value = mock_session

    database.async_session = lambda: mock_session  # type: ignore[assignment]
    try:
        gen = database.get_db()
        session = await gen.__anext__()
        assert session is mock_session
        try:
            raise RuntimeError("boom")
        except RuntimeError:
            await gen.athrow(RuntimeError("boom"))
    except RuntimeError:
        pass
    finally:
        database.async_session = real_session_factory

    mock_session.rollback.assert_called_once()
