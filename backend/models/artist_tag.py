from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class ArtistTag(Base):
    """Folksonomy tags for an artist name (shared across that artist's tracks).

    Artists have no dedicated table (artist is a plain string on tracks and
    albums), so the artist name itself is the key. Mirrors TrackTag/AlbumTag:
    normalized weight 0-100, per-row fetched_at for TTL freshness.
    """

    __tablename__ = "artist_tags"

    artist: Mapped[str] = mapped_column(String(500), primary_key=True)
    tag_id: Mapped[str] = mapped_column(String(36), ForeignKey("tags.id"), primary_key=True)
    weight: Mapped[int] = mapped_column(Integer)  # normalized 0-100
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
