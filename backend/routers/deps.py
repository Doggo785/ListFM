from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from repositories.users import get_user_by_lastfm_username


async def resolve_user_id(db: AsyncSession, username: str) -> str:
    """Resolve a Last.fm username to a user ID.

    Raises HTTPException(404) if the user is not found.
    """
    user = await get_user_by_lastfm_username(db, username)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return user.id
