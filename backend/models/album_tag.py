from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class AlbumTag(Base):
    __tablename__ = "album_tags"

    album_id: Mapped[str] = mapped_column(String(36), ForeignKey("albums.id"), primary_key=True)
    tag_id: Mapped[str] = mapped_column(String(36), ForeignKey("tags.id"), primary_key=True)
    weight: Mapped[int] = mapped_column(Integer)  # normalized 0-100
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
