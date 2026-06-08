from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class Track(BaseModel):
    title: str
    artist: str


class UserInfo(BaseModel):
    username: str
    image: str | None = None


class RecentTracksResponse(BaseModel):
    tracks: list[Track]


class ErrorResponse(BaseModel):
    error: str


# --- Automation CRUD schemas ---


class AutomationSource(BaseModel):
    type: Literal["top_tracks", "recent_tracks", "loved_tracks", "top_artists"]
    period: Literal["7d", "1m", "3m", "6m", "12m", "overall"]


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    source: AutomationSource
    cron: str = ""
    filter_groups: list[dict] = []
    output: dict = {"maxSize": 50}
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source: Optional[AutomationSource] = None
    cron: Optional[str] = None
    filter_groups: Optional[list[dict]] = None
    output: Optional[dict] = None
    enabled: Optional[bool] = None


class AutomationRead(BaseModel):
    id: str
    username: str
    name: str
    description: str
    source: AutomationSource
    cron: str
    filter_groups: list[dict]
    output: dict
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_run: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class GeneratedPlaylistCreate(BaseModel):
    automation_id: Optional[str] = None
    name: Optional[str] = None
    source_type: str
    source_period: str
    tracks: list[dict]
    track_count: int
    filter_groups: Optional[list[dict]] = None


class GeneratedPlaylistRead(BaseModel):
    id: str
    username: str
    automation_id: Optional[str] = None
    name: Optional[str] = None
    source_type: str
    source_period: str
    tracks: list[dict]
    track_count: int
    filter_groups: Optional[list[dict]] = None
    generated_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
