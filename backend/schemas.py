import re
from datetime import UTC, datetime
from typing import Literal

from apscheduler.triggers.cron import CronTrigger
from filter_types import FilterGroups
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
LASTFM_USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_email(v: str) -> str:
    normalized = v.strip().lower()
    if not EMAIL_REGEX.match(normalized):
        raise ValueError("Invalid email format")
    return normalized


def _validate_cron(v: str) -> str:
    """Accept empty (unscheduled) or a crontab the scheduler can parse."""
    if not v:
        return v
    try:
        CronTrigger.from_crontab(v, timezone=UTC)
    except Exception as e:  # noqa: BLE001 -- any parse failure becomes ValueError for pydantic
        raise ValueError(f"Invalid cron expression: {e}")
    return v


class EmailValidatorMixin:
    """Shared email validator for Pydantic models."""

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class PasswordValidatorMixin:
    """Shared password validator for Pydantic models.

    bcrypt silently truncates passwords at 72 BYTES, so the limit must count
    bytes (utf-8), not characters — a naive max_length=72 would let a
    multibyte password through and truncate it at hash time.
    """

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class UserCreate(EmailValidatorMixin, PasswordValidatorMixin, BaseModel):
    email: str
    password: str
    display_name: str | None = None


class UserLogin(EmailValidatorMixin, PasswordValidatorMixin, BaseModel):
    email: str
    password: str


class UserUpdate(PasswordValidatorMixin, BaseModel):
    email: str | None = None
    password: str | None = None
    display_name: str | None = None


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
    # Cookies only: neither token is exposed in the body, both travel as
    # httpOnly cookies. The frontend ignores this body (session via /me).
    # Keeping the body also shrinks XSS exfiltration surface: there is no
    # JS-readable copy of any token anywhere.
    token_type: str = "bearer"
    expires_in: int


class Track(BaseModel):
    title: str
    artist: str
    album: str | None = None


class TrackRead(BaseModel):
    id: str
    title: str
    artist: str
    album_id: str | None = None
    listeners: int
    global_playcount: int
    image_url: str | None = None
    last_fetched_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlbumRead(BaseModel):
    id: str
    title: str
    artist: str
    last_fetched_at: datetime | None = None
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
    last_played_at: datetime | None = None
    last_synced_at: datetime | None = None
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


class AutomationOutput(BaseModel):
    # Wire key stays camelCase to match the frontend contract (#12).
    maxSize: int = Field(default=50, ge=0, le=200)

    @field_validator("maxSize")
    @classmethod
    def zero_means_default(cls, v: int) -> int:
        # Explicit 0 (or absent) means "no preference" -> default 50.
        return 50 if v == 0 else v


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    source: AutomationSource
    cron: str = Field(default="", max_length=100)
    filter_groups: FilterGroups = Field(default_factory=list, alias="filterGroups")
    output: AutomationOutput = Field(default_factory=AutomationOutput)
    enabled: bool = True

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        return _validate_cron(v)


class PreviewRequest(BaseModel):
    """Preview body: the full automation draft, validated like a create."""

    automation: AutomationCreate


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    source: AutomationSource | None = None
    cron: str | None = Field(default=None, max_length=100)
    filter_groups: FilterGroups | None = Field(default=None, alias="filterGroups")
    output: AutomationOutput | None = None
    enabled: bool | None = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        return _validate_cron(v) if v is not None else v


class AutomationRead(BaseModel):
    id: str
    user_id: str
    lastfm_username: str
    name: str
    description: str | None = None
    source: AutomationSource
    cron: str | None = None
    filter_groups: FilterGroups = Field(alias="filterGroups")
    output: dict
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_run: datetime | None = None

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
    automation_id: str | None = None
    name: str | None = None
    description: str | None = None
    source_type: Literal["top_tracks", "recent_tracks", "loved_tracks", "top_artists"]
    source_period: Literal["7d", "1m", "3m", "6m", "12m", "overall"]
    tracks: list[Track]
    track_count: int
    filter_groups: list[dict] | None = None


class GeneratedPlaylistRead(BaseModel):
    id: str
    user_id: str
    automation_id: str | None = None
    lastfm_username: str
    name: str | None = None
    description: str | None = None
    track_count: int
    filter_groups: list[dict] | None = None
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


class PlaylistTrackItem(BaseModel):
    """Flat ordered track entry for playlist detail views."""

    position: int
    title: str
    artist: str


class AutomationHistoryRead(BaseModel):
    id: str
    automation_id: str
    generated_playlist_id: str | None = None
    status: str
    attempt: int = 1
    scheduled_for: datetime
    tracks_generated: int
    tracks_before_filter: int
    tracks_after_filter: int
    error_message: str | None = None
    filter_groups_used: list[dict] | None = None
    started_at: datetime
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SyncStatus(BaseModel):
    last_synced_at: datetime | None = None
    tracks_synced: int
    tags_synced: int
