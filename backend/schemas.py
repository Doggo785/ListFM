import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from filter_types import FilterGroups

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def _validate_email(v: str) -> str:
    normalized = v.strip().lower()
    if not EMAIL_REGEX.match(normalized):
        raise ValueError("Invalid email format")
    return normalized


class EmailValidatorMixin:
    """Shared email validator for Pydantic models."""

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class UserCreate(EmailValidatorMixin, BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class UserLogin(EmailValidatorMixin, BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None


class LinkLastfmRequest(BaseModel):
    username: str


class LinkLastfmResponse(BaseModel):
    username: str
    image: str | None = None


class AuthProviderRead(BaseModel):
    id: str
    user_id: str
    provider: str
    provider_user_id: str
    linked_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OAuthCompleteEmailRequest(EmailValidatorMixin, BaseModel):
    email: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


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
    filter_groups: FilterGroups = Field(default_factory=list, alias="filterGroups")
    output: dict = {"maxSize": 50}
    enabled: bool = True

    model_config = ConfigDict(populate_by_name=True)


class AutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source: Optional[AutomationSource] = None
    cron: Optional[str] = None
    filter_groups: Optional[FilterGroups] = Field(default=None, alias="filterGroups")
    output: Optional[dict] = None
    enabled: Optional[bool] = None

    model_config = ConfigDict(populate_by_name=True)


class AutomationRead(BaseModel):
    id: str
    user_id: str
    lastfm_username: str
    name: str
    description: Optional[str] = None
    source: AutomationSource
    cron: Optional[str] = None
    filter_groups: FilterGroups = Field(alias="filterGroups")
    output: dict
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_run: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

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
    source_type: Literal["top_tracks", "recent_tracks", "loved_tracks", "top_artists"]
    source_period: Literal["7d", "1m", "3m", "6m", "12m", "overall"]
    tracks: list[Track]
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
