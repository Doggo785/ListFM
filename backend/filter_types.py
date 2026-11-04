"""Typed models for the recursive automation filter tree (JSONB).

Mirrors the frontend contract in frontend/src/lib/automation-rules.js so the
backend validates the tree
server-side instead of treating it as untyped ``list[dict]``.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB

FilterLogic = Literal["AND", "OR"]

FilterField = Literal[
    "userplaycount",
    "userloved",
    "playcount",
    "tags",
    "timestamp",
    "first_played",
    "artist_rank",
    "listening_moment",
]

# Every operator the frontend can emit (FILTER_OPERATORS), plus the newer filters' own.
FilterOperator = Literal[
    "eq",
    "gte",
    "lte",
    "between",
    "contains",
    "not_contains",
    "is",
    "within_days",
    "before",
]


class WindowSpan(BaseModel):
    amount: int = Field(ge=1, le=1000)
    unit: Literal["day", "week", "month", "year"]


class AutomationWindow(BaseModel):
    """Which listens an automation reads (GLOSSARY: Fenêtre).

    Counted back from the run's scheduled time: ``ago`` shifts the end
    ("a year ago"), ``length`` is the span before it. No length = every
    listen up to the end.
    """

    length: WindowSpan | None = None
    ago: WindowSpan | None = None


class ArtistRankPeriod(AutomationWindow):
    """The listens an artist_rank condition ranks artists on.

    A relative window like the automation's, or fixed dates ("my top of
    2019"): those keep the same artists from run to run. Both dates included.
    """

    since: date | None = None
    until: date | None = None

    @model_validator(mode="after")
    def fixed_dates_or_relative(self):
        if (self.since is None) != (self.until is None):
            raise ValueError("since and until go together")
        if self.since is not None and self.until is not None:
            if self.since > self.until:
                raise ValueError("since must not be after until")
            if self.length is not None or self.ago is not None:
                raise ValueError("fixed dates exclude length and ago")
        return self


class ListeningMoment(BaseModel):
    """When listens count for a listening_moment condition, in the user's timezone.

    Days run from 1 (Monday) to 7, both included, and may wrap ("Saturday to
    Monday"). Hours run from fromHour up to toHour excluded and may cross
    midnight: then the hours after midnight belong to the day the night began.
    """

    fromDay: int | None = Field(default=None, ge=1, le=7)
    toDay: int | None = Field(default=None, ge=1, le=7)
    fromHour: int | None = Field(default=None, ge=0, le=23)
    toHour: int | None = Field(default=None, ge=0, le=23)

    @model_validator(mode="after")
    def complete_ranges(self):
        if (self.fromDay is None) != (self.toDay is None):
            raise ValueError("fromDay and toDay go together")
        if (self.fromHour is None) != (self.toHour is None):
            raise ValueError("fromHour and toHour go together")
        if self.fromDay is None and self.fromHour is None:
            raise ValueError("A moment needs days or hours")
        if self.fromHour is not None and self.fromHour == self.toHour:
            raise ValueError("fromHour and toHour must differ")
        return self


class FilterCondition(BaseModel):
    """A single leaf condition, mirroring ``createCondition()``."""

    id: str
    field: FilterField
    operator: FilterOperator
    value: int | float | bool | str
    valueMax: int | float | None = None
    countMin: int = 0
    tagSource: Literal["artist", "album"] = "artist"
    # artist_rank only. None ranks artists on the automation's own window.
    period: ArtistRankPeriod | None = None
    # listening_moment only: value is then the minimum listens at that moment.
    moment: ListeningMoment | None = None

    @model_validator(mode="after")
    def moment_field_has_a_moment(self):
        if self.field == "listening_moment" and self.moment is None:
            raise ValueError("A listening_moment condition needs a moment")
        return self


class FilterGroup(BaseModel):
    """A recursive group combining conditions and sub-groups with a logic."""

    id: str
    logic: FilterLogic = "AND"
    conditions: list[FilterCondition] = Field(default_factory=list)
    groups: list["FilterGroup"] = Field(default_factory=list)


_ = FilterGroup.model_rebuild()

FilterGroups = list[FilterGroup]


def check_group_depth(groups: FilterGroups | None) -> FilterGroups | None:
    """A group and its sub-groups, no deeper: past that nobody reads the logic."""
    for group in groups or []:
        if any(sub.groups for sub in group.groups):
            raise ValueError("Filter groups nest two levels at most")
    return groups


class FilterGroupListJSONB(TypeDecorator[list[FilterGroup]]):
    """JSONB column that round-trips ``list[FilterGroup]`` at the ORM layer.

    The DB column stays JSONB (no DDL change); this decorator only converts
    between Python ``FilterGroup`` objects and the stored JSON dicts.
    """

    impl = JSONB
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, list):
            return [
                g.model_dump(mode="json") if isinstance(g, FilterGroup) else g
                for g in value
            ]
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return [FilterGroup.model_validate(g) for g in value]

    def coerce_compared_value(self, op, value):
        return self.impl_instance.coerce_compared_value(op, value)
