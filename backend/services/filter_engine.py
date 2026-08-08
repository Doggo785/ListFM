"""Server-side port of frontend/src/lib/filter-engine.js.

Keeps the exact same filter semantics as the JS implementation so preview and
the scheduled automation runner share one source of truth:

- numeric compare ops (eq/neq/gt/gte/lt/lte/between) with JS-style NaN handling
- tag contains/not_contains/eq with countMin
- userloved `is`
- relative Date.now() for recent timestamps (within_days/before)
- recursive AND/OR groups; top-level groups are OR'd

Accepts both plain dicts (from the API request body) and the
FilterGroup/FilterCondition Pydantic models (from the DB JSONB column).
"""

import math
import time


def _get(obj, key, default=None):
    """Read a key from a dict or an attribute from a Pydantic model."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _to_number(value):
    """JS-style Number(): None/undefined -> NaN, bool -> 0/1, '' -> 0."""
    if value is None:
        return float("nan")
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, str) and value.strip() == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def get_field_value(track, field, tag_source):
    if field == "timestamp":
        if track.get("timestamp") is None:
            return None
        return math.floor(time.time()) - track["timestamp"]
    if field == "tags":
        if tag_source == "album":
            return track.get("album_tags") or []
        return track.get("artist_tags") or []
    return track.get(field)


def evaluate_condition(track, condition):
    field = _get(condition, "field")
    operator = _get(condition, "operator")
    value = _get(condition, "value")
    value_max = _get(condition, "valueMax")
    count_min = _get(condition, "countMin") or 0
    tag_source = _get(condition, "tagSource")

    field_value = get_field_value(track, field, tag_source)

    if field == "tags":
        tags = field_value if isinstance(field_value, list) else []
        match = None
        for t in tags:
            name = _get(t, "name")
            count = _get(t, "count")
            if (
                name
                and str(name).lower() == str(value).lower()
                and count is not None
                and count >= count_min
            ):
                match = t
                break
        if operator == "contains":
            return match is not None
        if operator == "not_contains":
            return match is None
        if operator == "eq":
            return match is not None
        return False

    if field == "userloved":
        bool_val = value is True or value == "true" or value == 1
        if operator == "is":
            return bool(field_value) == bool_val
        return False

    num = _to_number(field_value)
    target = _to_number(value)

    if math.isnan(target):
        return False
    if math.isnan(num):
        return field == "timestamp"

    if operator == "eq":
        return num == target
    if operator == "neq":
        return num != target
    if operator == "gt":
        return num > target
    if operator == "gte":
        return num >= target
    if operator == "lt":
        return num < target
    if operator == "lte":
        return num <= target
    if operator == "between":
        max_val = _to_number(value_max)
        if math.isnan(max_val):
            return False
        return num >= target and num <= max_val
    if operator == "within_days":
        return num <= target * 86400
    if operator == "before":
        return num >= target * 86400
    if operator == "contains":
        return str(field_value).lower().find(str(value).lower()) != -1
    if operator == "not_contains":
        return str(field_value).lower().find(str(value).lower()) == -1
    return False


def evaluate_group(track, group):
    if not group:
        return True

    conditions = _get(group, "conditions") or []
    groups = _get(group, "groups") or []
    logic = _get(group, "logic") or "AND"

    results = [evaluate_condition(track, c) for c in conditions]
    results += [evaluate_group(track, g) for g in groups]

    if len(results) == 0:
        return True

    return all(results) if logic == "AND" else any(results)


def apply_filters(tracks, filter_groups):
    if not filter_groups or len(filter_groups) == 0:
        return tracks
    return [t for t in tracks if any(evaluate_group(t, g) for g in filter_groups)]


def count_active_conditions(filter_groups):
    if not filter_groups:
        return 0
    count = 0
    for group in filter_groups:
        count += len(_get(group, "conditions") or [])
        count += count_active_conditions(_get(group, "groups") or [])
    return count