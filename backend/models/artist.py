from datetime import datetime

from database import Base
from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column


class Artist(Base):
    """When an artist's tags were last fetched from Last.fm.

    Artists are plain strings elsewhere; this row only exists so a known
    artist's tags (including an empty list) are not refetched for every new
    track of theirs.
    """

    __tablename__ = "artists"

    name: Mapped[str] = mapped_column(String(500), primary_key=True)
    tags_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
