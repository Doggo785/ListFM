from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class AuthProvider(Base):
    __tablename__ = "auth_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(50))  # email|lastfm
    provider_user_id: Mapped[str] = mapped_column(String(255))  # unique per provider (Last.fm username)
    access_token: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # encrypted at rest
    refresh_token: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # encrypted at rest
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
