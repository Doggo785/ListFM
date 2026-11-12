from datetime import datetime

from database import Base
from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # IANA zone schedules and listening moments are read in. Empty until the first browser
    # sets it; after that only the Settings page changes it.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # Listening history sync (ADR 0001): last finished sync, and the end of
    # the first full load (runs wait for it).
    scrobbles_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scrobbles_complete_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The newcomer's guide was finished or skipped: it starts by itself only before that.
    guide_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # soft delete
