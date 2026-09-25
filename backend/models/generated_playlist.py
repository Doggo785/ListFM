from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class GeneratedPlaylist(Base):
    __tablename__ = "generated_playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    automation_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("automations.id"), nullable=True)
    lastfm_username: Mapped[str] = mapped_column(String(255))  # snapshot
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    track_count: Mapped[int] = mapped_column(Integer)  # cached count
    filter_groups: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # snapshot of filters used
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # soft delete
