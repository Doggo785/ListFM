from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from database import Base


class AutomationHistory(Base):
    __tablename__ = "automation_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    automation_id: Mapped[str] = mapped_column(String(36), ForeignKey("automations.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))  # running|completed|failed
    tracks_generated: Mapped[int] = mapped_column(Integer, default=0)
    tracks_before_filter: Mapped[int] = mapped_column(Integer, default=0)
    tracks_after_filter: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    filter_groups_used: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
