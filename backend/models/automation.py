from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from filter_types import FilterGroup, FilterGroupListJSONB


class Automation(Base):
    __tablename__ = "automations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    lastfm_username: Mapped[str] = mapped_column(String(255))  # snapshot at creation time
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    source_type: Mapped[str] = mapped_column(String(50))  # top_tracks, recent_tracks, loved_tracks, top_artists
    source_period: Mapped[str] = mapped_column(String(20))  # 7d, 1m, 3m, 6m, 12m, overall
    cron: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    filter_groups: Mapped[list[FilterGroup]] = mapped_column(FilterGroupListJSONB, default=list)  # Recursive filter tree as JSONB
    output_max_size: Mapped[int] = mapped_column(Integer, default=50)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
