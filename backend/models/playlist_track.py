from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id: Mapped[str] = mapped_column(String(36), ForeignKey("generated_playlists.id"), primary_key=True)
    track_id: Mapped[str] = mapped_column(String(36), ForeignKey("tracks.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
