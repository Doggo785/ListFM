from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class Scrobble(Base):
    """One listen recorded by Last.fm (ADR 0001: full history kept locally)."""

    __tablename__ = "scrobbles"

    # PK order serves "a user's listens in a window" range scans.
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    played_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    track_id: Mapped[str] = mapped_column(String(36), ForeignKey("tracks.id"), primary_key=True)
