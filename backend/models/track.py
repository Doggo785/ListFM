from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Track(Base):
    __tablename__ = "tracks"
    __table_args__ = (UniqueConstraint("artist", "title", name="uq_tracks_artist_title"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    artist: Mapped[str] = mapped_column(String(500))
    album_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("albums.id"), nullable=True, index=True)
    listeners: Mapped[int] = mapped_column(Integer, default=0)
    global_playcount: Mapped[int] = mapped_column(Integer, default=0)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)  # cache invalidation
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
