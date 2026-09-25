from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column


class AuthProvider(Base):
    __tablename__ = "auth_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(50))  # email|lastfm|google|discord
    provider_user_id: Mapped[str] = mapped_column(String(255))  # unique per provider (Last.fm username)
    # access_token / refresh_token / token_expires_at were removed by migration
    # a9c4e2f1b7d3: no flow ever persisted provider tokens (they are used in
    # memory, then discarded). If a flow ever needs to store them, add the
    # columns back encrypted at rest (e.g. Fernet TypeDecorator), never plaintext.
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
