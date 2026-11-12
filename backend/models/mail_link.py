from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class MailLink(Base):
    """A link sent by email (confirm the address, reset the password). Only its hash is kept; it works once."""

    __tablename__ = "mail_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(10))  # verify|reset
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)  # sha256
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
