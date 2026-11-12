"""Housekeeping for accounts that never opened: the scheduler runs it every hour."""

import logging
from datetime import timedelta

from database import async_session
from repositories.mail_links import delete_expired_mail_links
from repositories.users import purge_unconfirmed_signups
from services.activity_log import log_activity
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

# How long an unconfirmed sign-up keeps its address before anyone can take it again.
UNCONFIRMED_KEPT = timedelta(days=7)


async def purge_stale_signups() -> None:
    async with async_session() as db:
        try:
            gone = await purge_unconfirmed_signups(db, UNCONFIRMED_KEPT)
            await delete_expired_mail_links(db)
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("purging unconfirmed sign-ups failed")
            return
    if gone:
        log_activity("account", "", f"{gone} unconfirmed sign-up(s) erased")
