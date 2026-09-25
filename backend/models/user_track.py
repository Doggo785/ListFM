from datetime import datetime

from database import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class UserTrack(Base):
    __tablename__ = "user_tracks"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    track_id: Mapped[str] = mapped_column(String(36), ForeignKey("tracks.id"), primary_key=True)
    user_playcount: Mapped[int] = mapped_column(Integer, default=0)
    userloved: Mapped[bool] = mapped_column(Boolean, default=False)
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # incremental from recent tracks
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # for differential sync
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
