"""The filter engine: which tracks of the window an automation keeps.

- numeric compare ops (eq/gte/lte/between)
- tag contains/not_contains with countMin
- userloved `is`
- ages counted from the run's date (within_days/before)
- recursive AND/OR groups; top-level groups are OR'd
- a condition without its value and a group with nothing in it are ignored:
  they say nothing about tracks, neither "keep all" nor "keep none"

Accepts both plain dicts and the FilterGroup/FilterCondition Pydantic models
(from the DB JSONB column).
"""

import math
import time


def _get(obj, key, default=None):
    """Read a key from a dict or an attribute from a Pydantic model."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _to_number(value):
    """Number or NaN; bool -> 0/1."""
    if value is None:
        return float("nan")
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def get_field_value(track, field, tag_source, now):
    if field in ("timestamp", "first_played"):
        played = track.get(field)
        return None if played is None else now - played
    if field == "tags":
        return track.get("album_tags" if tag_source == "album" else "artist_tags")
    return track.get(field)


def _find_tag_match(tags, value, count_min):
    """First tag whose name matches (case-insensitive) with count >= count_min."""
    for t in tags:
        name = _get(t, "name")
        count = _get(t, "count")
        if (
            name
            and str(name).lower() == str(value).lower()
            and count is not None
            and count >= count_min
        ):
            return t
    return None


_TAG_OPERATORS = {
    "contains": lambda match: match is not None,
    "not_contains": lambda match: match is None,
}


def _evaluate_tag_condition(field_value, operator, value, count_min):
    """tags field: match by name (case-insensitive) AND count >= countMin.

    Tags never looked up match nothing, not even not_contains: unknown is not "no tag".
    """
    if not isinstance(field_value, list):
        return False
    match = _find_tag_match(field_value, value, count_min)
    handler = _TAG_OPERATORS.get(operator)
    return handler(match) if handler is not None else False


def _evaluate_boolean_condition(field_value, operator, value):
    """userloved field: `is` compares bool(field_value) to the coerced value."""
    if operator != "is":
        return False
    bool_val = value is True or value == "true" or value == 1
    return bool(field_value) == bool_val


def _between(num, target, value_max):
    """Numeric between: False when valueMax is not a number."""
    max_val = _to_number(value_max)
    if math.isnan(max_val):
        return False
    return num >= target and num <= max_val


_NUMERIC_OPERATORS = {
    "eq": lambda num, target, value_max: num == target,
    "gte": lambda num, target, value_max: num >= target,
    "lte": lambda num, target, value_max: num <= target,
    "between": _between,
    "within_days": lambda num, target, value_max: num <= target * 86400,
    "before": lambda num, target, value_max: num >= target * 86400,
}


def _evaluate_numeric_condition(operator, field_value, value, value_max):
    num = _to_number(field_value)
    target = _to_number(value)
    if math.isnan(target) or math.isnan(num):
        return False
    handler = _NUMERIC_OPERATORS.get(operator)
    return handler(num, target, value_max) if handler is not None else False


def evaluate_condition(track, condition, now=None):
    now = math.floor(time.time()) if now is None else now
    field = _get(condition, "field")
    operator = _get(condition, "operator")
    value = _get(condition, "value")
    value_max = _get(condition, "valueMax")
    count_min = _get(condition, "countMin") or 0
    tag_source = _get(condition, "tagSource")

    # Each of these conditions has its own period or moment: the pipeline computes per id.
    if field == "artist_rank":
        field_value = (track.get("artist_ranks") or {}).get(_get(condition, "id"))
    elif field == "listening_moment":
        field_value = (track.get("moment_plays") or {}).get(_get(condition, "id"), 0)
    else:
        field_value = get_field_value(track, field, tag_source, now)

    if field == "tags":
        return _evaluate_tag_condition(field_value, operator, value, count_min)
    if field == "userloved":
        return _evaluate_boolean_condition(field_value, operator, value)
    return _evaluate_numeric_condition(operator, field_value, value, value_max)


def _is_complete(condition):
    value = _get(condition, "value")
    if value is None or (isinstance(value, str) and not value.strip()):
        return False
    if _get(condition, "operator") == "between":
        return _get(condition, "valueMax") not in (None, "")
    return True


def _is_active(group):
    return any(_is_complete(c) for c in _get(group, "conditions") or []) or any(
        _is_active(g) for g in _get(group, "groups") or []
    )


def evaluate_group(track, group, now=None):
    results = [evaluate_condition(track, c, now) for c in _get(group, "conditions") or [] if _is_complete(c)]
    results += [evaluate_group(track, g, now) for g in _get(group, "groups") or [] if _is_active(g)]
    if not results:
        return True
    return all(results) if (_get(group, "logic") or "AND") == "AND" else any(results)


def conditions_on(filter_groups, field, setting):
    """(condition id, its setting) of every condition on this field in the tree."""
    for group in filter_groups or []:
        for condition in _get(group, "conditions") or []:
            if _get(condition, "field") == field:
                yield _get(condition, "id"), _get(condition, setting)
        yield from conditions_on(_get(group, "groups"), field, setting)


def apply_filters(tracks, filter_groups, now=None):
    """Tracks kept by the filters; ``now`` is the run's date in epoch seconds."""
    active = [g for g in filter_groups or [] if _is_active(g)]
    if not active:
        return tracks
    now = math.floor(time.time()) if now is None else now
    return [t for t in tracks if any(evaluate_group(t, g, now) for g in active)]
