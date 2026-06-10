from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from database import Base


class GeneratedPlaylist(Base):
    __tablename__ = "generated_playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    automation_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("automations.id"), nullable=True)
    lastfm_username: Mapped[str] = mapped_column(String(255))  # snapshot
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    track_count: Mapped[int] = mapped_column(Integer)  # cached count
    filter_groups: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # snapshot of filters used
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)  # soft delete
