import re
from datetime import UTC, datetime, tzinfo
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger
from filter_types import AutomationWindow, FilterGroups, WindowSpan, check_group_depth
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
LASTFM_USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_email(v: str) -> str:
    normalized = v.strip().lower()
    if not EMAIL_REGEX.match(normalized):
        raise ValueError("Invalid email format")
    return normalized


_WEEKDAY_NAMES = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
_WEEKDAY_ITEM = re.compile(r"^(\*|\d+)(?:-(\d+))?(?:/(\d+))?$")


def _named_weekdays(field: str) -> str:
    """Crontab weekday numbers (0 and 7 are Sunday) as names, because APScheduler starts at Monday."""
    days: list[str] = []
    for item in field.split(","):
        match = _WEEKDAY_ITEM.match(item)
        if match is None or item == "*":
            days.append(item)
            continue
        start, end, step = match.groups()
        first = 0 if start == "*" else int(start)
        last = int(end) if end else (6 if start == "*" or step else first)
        if first > 7 or last > 7:
            raise ValueError(f"Weekday out of range: {item}")
        days += [_WEEKDAY_NAMES[day % 7] for day in range(first, last + 1, int(step or 1))]
    return ",".join(dict.fromkeys(days))


def cron_trigger(expr: str, timezone: tzinfo) -> CronTrigger:
    """The trigger of a standard crontab, whose weekday number means what cron says it means."""
    parts = expr.split()
    if len(parts) == 5:
        parts[4] = _named_weekdays(parts[4])
    return CronTrigger.from_crontab(" ".join(parts), timezone=timezone)


def _validate_cron(v: str) -> str:
    """Accept empty (unscheduled) or a crontab the scheduler can parse."""
    if not v:
        return v
    try:
        cron_trigger(v, UTC)
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


class TimezoneUpdate(BaseModel):
    timezone: str

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Unknown timezone") from exc
        return v


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


def _default_window() -> AutomationWindow:
    return AutomationWindow(length=WindowSpan(amount=3, unit="month"))


# GLOSSARY: Tri. random_weighted favors tracks played more in the window.
SortKey = Literal["most_played", "last_played", "first_played", "random", "random_weighted"]


# What most_played and random_weighted count: every listen of the window, or
# only those of the automation's listening_moment filters.
SortCounts = Literal["window", "moment"]


class AutomationOutput(BaseModel):
    # Wire key stays camelCase to match the frontend contract (#12).
    maxSize: int = Field(default=50, ge=0, le=200)
    # GLOSSARY: Limite. None = no limit.
    maxPerArtist: int | None = Field(default=None, ge=1, le=200)
    maxPerAlbum: int | None = Field(default=None, ge=1, le=200)
    noRepeatPlaylists: int | None = Field(default=None, ge=1, le=50)

    @field_validator("maxSize")
    @classmethod
    def zero_means_default(cls, v: int) -> int:
        # Explicit 0 (or absent) means "no preference" -> default 50.
        return 50 if v == 0 else v


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    window: AutomationWindow = Field(default_factory=_default_window)
    sort: SortKey = "most_played"
    sort_counts: SortCounts = Field(default="window", alias="sortCounts")
    cron: str = Field(default="", max_length=100)
    filter_groups: FilterGroups = Field(default_factory=list, alias="filterGroups")
    output: AutomationOutput = Field(default_factory=AutomationOutput)
    enabled: bool = True

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        return _validate_cron(v)

    @field_validator("filter_groups")
    @classmethod
    def validate_filter_depth(cls, v: FilterGroups) -> FilterGroups:
        check_group_depth(v)
        return v


class PreviewRequest(BaseModel):
    """Preview body: the full automation draft, validated like a create."""

    automation: AutomationCreate
    # The saved automation being edited, so the preview applies noRepeatPlaylists.
    automation_id: str | None = Field(default=None, max_length=36)
    # Client-generated ticket for live progress polling during the request.
    # The client polls GET /automations/preview-progress/{token} while the
    # POST runs; absent token = today's fire-and-wait behavior.
    progress_token: str | None = Field(default=None, max_length=64)


class KnownTag(BaseModel):
    """A tag of the catalogue, and how many of the user's artists carry it."""

    name: str
    artists: int


class ScrobbleSyncStatus(BaseModel):
    """Listening history sync: live progress, and whether the first full load is done."""

    stage: str | None = None
    done: int = 0
    total: int = 0
    error: str | None = None
    complete: bool
    synced_at: datetime | None = None
    # The tag catalogue's pass for this user, zero when none is running.
    tags_done: int = 0
    tags_total: int = 0


class ListeningTotals(BaseModel):
    listens: int
    tracks: int
    artists: int
    albums: int
    # False during the first full load: the totals are still growing.
    complete: bool


class ProgressRead(BaseModel):
    """Live progress snapshot for a run or preview ticket."""

    stage: str
    done: int
    total: int
    calls: int = 0
    error: str | None = None


class RunRequest(BaseModel):
    """Optional body for POST /automations/{id}/run (all fields optional)."""

    progress_token: str | None = Field(default=None, max_length=64)


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    window: AutomationWindow | None = None
    sort: SortKey | None = None
    sort_counts: SortCounts | None = Field(default=None, alias="sortCounts")
    cron: str | None = Field(default=None, max_length=100)
    filter_groups: FilterGroups | None = Field(default=None, alias="filterGroups")
    output: AutomationOutput | None = None
    enabled: bool | None = None

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        return _validate_cron(v) if v is not None else v

    @field_validator("filter_groups")
    @classmethod
    def validate_filter_depth(cls, v: FilterGroups | None) -> FilterGroups | None:
        return check_group_depth(v)


class AutomationRead(BaseModel):
    id: str
    user_id: str
    lastfm_username: str
    name: str
    description: str | None = None
    window: AutomationWindow
    sort: SortKey
    sort_counts: SortCounts = Field(alias="sortCounts")
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
        """Auto-restructure the flat output_max_size DB column into the nested schema."""
        if hasattr(values, "output_max_size"):
            return {
                "id": values.id,
                "user_id": values.user_id,
                "lastfm_username": values.lastfm_username,
                "name": values.name,
                "description": values.description,
                "window": values.window,
                "sort": values.sort,
                "sort_counts": values.sort_counts,
                "cron": values.cron,
                "filter_groups": values.filter_groups or [],
                "output": {
                    "maxSize": values.output_max_size,
                    "maxPerArtist": values.output_max_per_artist,
                    "maxPerAlbum": values.output_max_per_album,
                    "noRepeatPlaylists": values.output_no_repeat_playlists,
                },
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
