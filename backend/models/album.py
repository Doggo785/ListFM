from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    artist: Mapped[str] = mapped_column(String(500))
    last_fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)  # cache invalidation
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
