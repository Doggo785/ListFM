from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from database import Base


class GeneratedPlaylist(Base):
    __tablename__ = "generated_playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID string
    username: Mapped[str] = mapped_column(String(255), index=True)  # Last.fm username, indexed
    automation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # FK to automations
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # User-given name
    source_type: Mapped[str] = mapped_column(String(50))  # top_tracks, recent_tracks, etc.
    source_period: Mapped[str] = mapped_column(String(20))  # 7d, 1m, 3m, etc.
    tracks: Mapped[list] = mapped_column(JSONB)  # Array of enriched track objects
    track_count: Mapped[int] = mapped_column(Integer)  # Denormalized count
    filter_groups: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # Snapshot of filters
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # When generated
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
