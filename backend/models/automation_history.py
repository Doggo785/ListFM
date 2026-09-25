from datetime import datetime

from database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class AutomationHistory(Base):
    __tablename__ = "automation_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    automation_id: Mapped[str] = mapped_column(String(36), ForeignKey("automations.id"), index=True)
    generated_playlist_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("generated_playlists.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20))  # running|completed|failed
    attempt: Mapped[int] = mapped_column(Integer, default=1)  # 1 = initial run, 2+ = retries
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # decided-at; started_at = actual pipeline start
    tracks_generated: Mapped[int] = mapped_column(Integer, default=0)
    tracks_before_filter: Mapped[int] = mapped_column(Integer, default=0)
    tracks_after_filter: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    filter_groups_used: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
