from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class UserCreate(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    email_verified: bool
    display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None


class AuthProviderCreate(BaseModel):
    provider: Literal["email", "lastfm"]
    provider_user_id: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


class AuthProviderRead(BaseModel):
    id: str
    user_id: str
    provider: str
    provider_user_id: str
    linked_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenRefresh(BaseModel):
    refresh_token: str


class Track(BaseModel):
    title: str
    artist: str
    album: Optional[str] = None


class TrackRead(BaseModel):
    id: str
    title: str
    artist: str
    album_id: Optional[str] = None
    listeners: int
    global_playcount: int
    image_url: Optional[str] = None
    last_fetched_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlbumRead(BaseModel):
    id: str
    title: str
    artist: str
    last_fetched_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TagRead(BaseModel):
    id: str
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackTagRead(BaseModel):
    tag: TagRead
    weight: int
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlbumTagRead(BaseModel):
    tag: TagRead
    weight: int
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserTrackRead(BaseModel):
    track: TrackRead
    user_playcount: int
    userloved: bool
    last_played_at: Optional[datetime] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserInfo(BaseModel):
    username: str
    image: str | None = None


class RecentTracksResponse(BaseModel):
    tracks: list[Track]


class ErrorResponse(BaseModel):
    error: str


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
    user_id: str
    lastfm_username: str
    name: str
    description: Optional[str] = None
    source: AutomationSource
    cron: Optional[str] = None
    filter_groups: list[dict]
    output: dict
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_run: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def flatten_orm(cls, values):
        """Auto-restructure flat DB columns (source_type/source_period/output_max_size) into nested schema."""
        if hasattr(values, "source_type"):
            return {
                "id": values.id,
                "user_id": values.user_id,
                "lastfm_username": values.lastfm_username,
                "name": values.name,
                "description": values.description,
                "source": {"type": values.source_type, "period": values.source_period},
                "cron": values.cron,
                "filter_groups": values.filter_groups or [],
                "output": {"maxSize": values.output_max_size},
                "enabled": values.enabled,
                "created_at": values.created_at,
                "updated_at": values.updated_at,
                "last_run": values.last_run,
            }
        return values


class GeneratedPlaylistCreate(BaseModel):
    automation_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    source_type: str
    source_period: str
    tracks: list[Track]  # Track objects from Last.fm (title, artist)
    track_count: int
    filter_groups: Optional[list[dict]] = None


class GeneratedPlaylistRead(BaseModel):
    id: str
    user_id: str
    automation_id: Optional[str] = None
    lastfm_username: str
    name: Optional[str] = None
    description: Optional[str] = None
    track_count: int
    filter_groups: Optional[list[dict]] = None
    generated_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PlaylistTrackCreate(BaseModel):
    track_id: str
    position: int


class PlaylistTrackRead(BaseModel):
    track: TrackRead
    position: int
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationHistoryRead(BaseModel):
    id: str
    automation_id: str
    status: str
    tracks_generated: int
    tracks_before_filter: int
    tracks_after_filter: int
    error_message: Optional[str] = None
    filter_groups_used: Optional[list[dict]] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SyncStatus(BaseModel):
    last_synced_at: Optional[datetime] = None
    tracks_synced: int
    tags_synced: int
