"""Typed models for the recursive automation filter tree (JSONB).

Mirrors the frontend contract in frontend/src/lib/filter-engine.js and
frontend/src/lib/automation-rules.js so the backend validates the tree
server-side instead of treating it as untyped ``list[dict]``.
"""

from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB

FilterLogic = Literal["AND", "OR"]

FilterField = Literal[
    "userplaycount",
    "userloved",
    "playcount",
    "global_playcount",
    "listeners",
    "rank",
    "tags",
    "timestamp",
]

# Permissive union of every operator the frontend can emit (FILTER_OPERATORS).
FilterOperator = Literal[
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "contains",
    "not_contains",
    "is",
    "within_days",
    "before",
]


class FilterCondition(BaseModel):
    """A single leaf condition, mirroring ``createCondition()``."""

    id: str
    field: FilterField
    operator: FilterOperator
    value: int | float | bool | str
    valueMax: int | float | None = None
    countMin: int = 0
    tagSource: Literal["artist", "album"] = "artist"


class FilterGroup(BaseModel):
    """A recursive group combining conditions and sub-groups with a logic."""

    id: str
    logic: FilterLogic = "AND"
    conditions: list[FilterCondition] = Field(default_factory=list)
    groups: list["FilterGroup"] = Field(default_factory=list)


_ = FilterGroup.model_rebuild()

FilterGroups = list[FilterGroup]


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
