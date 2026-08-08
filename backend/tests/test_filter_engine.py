"""Tests for the server-side filter engine (port of frontend/src/lib/filter-engine.js).

Parity fixtures mirror the JS semantics from filter-engine.js so the Python
port stays behaviorally identical: numeric compare ops (eq/neq/gt/gte/lt/lte)
with NaN handling, tag contains/not_contains/eq with countMin, userloved is,
relative Date.now() for recent timestamps, and recursive AND/OR groups.
"""

import time
from unittest.mock import patch

from services.automation_runner import run_automation_pipeline
from services.filter_engine import apply_filters, count_active_conditions


def _condition(**overrides) -> dict:
    cond = {
        "id": "c1",
        "field": "userplaycount",
        "operator": "gte",
        "value": 0,
        "valueMax": None,
        "countMin": 0,
        "tagSource": "artist",
    }
    cond.update(overrides)
    return cond


def _group(conditions=None, groups=None, logic="AND", **overrides) -> dict:
    group = {
        "id": "g1",
        "logic": logic,
        "conditions": conditions or [],
        "groups": groups or [],
    }
    group.update(overrides)
    return group


def _track(**overrides) -> dict:
    track = {
        "artist": "Artist",
        "title": "Track",
        "userplaycount": 0,
        "userloved": False,
        "playcount": 0,
        "global_playcount": 0,
        "listeners": 0,
        "rank": 0,
        "artist_tags": [],
        "album_tags": [],
    }
    track.update(overrides)
    return track


class TestNumericOperators:
    def test_gte_filters_low_playcounts(self):
        tracks = [_track(title="low", userplaycount=5), _track(title="high", userplaycount=20)]
        groups = [_group(conditions=[_condition(field="userplaycount", operator="gte", value=10)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["high"]

    def test_neq(self):
        tracks = [_track(title="a", userplaycount=5), _track(title="b", userplaycount=10)]
        groups = [_group(conditions=[_condition(field="userplaycount", operator="neq", value=5)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["b"]

    def test_gt_lt_lte(self):
        tracks = [
            _track(title="a", userplaycount=1),
            _track(title="b", userplaycount=5),
            _track(title="c", userplaycount=10),
        ]
        gt = [_group(conditions=[_condition(field="userplaycount", operator="gt", value=1)])]
        lt = [_group(conditions=[_condition(field="userplaycount", operator="lt", value=10)])]
        lte = [_group(conditions=[_condition(field="userplaycount", operator="lte", value=5)])]
        assert [t["title"] for t in apply_filters(tracks, gt)] == ["b", "c"]
        assert [t["title"] for t in apply_filters(tracks, lt)] == ["a", "b"]
        assert [t["title"] for t in apply_filters(tracks, lte)] == ["a", "b"]

    def test_between(self):
        tracks = [
            _track(title="a", userplaycount=1),
            _track(title="b", userplaycount=5),
            _track(title="c", userplaycount=10),
        ]
        groups = [_group(conditions=[_condition(field="userplaycount", operator="between", value=2, valueMax=8)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["b"]

    def test_missing_numeric_field_is_nan_and_fails(self):
        # JS: Number(undefined) -> NaN -> condition is false for numeric fields
        tracks = [_track(title="noise")]
        del tracks[0]["userplaycount"]
        groups = [_group(conditions=[_condition(field="userplaycount", operator="gte", value=0)])]
        assert apply_filters(tracks, groups) == []

    def test_non_numeric_target_is_nan_and_fails(self):
        tracks = [_track(title="a", userplaycount=5)]
        groups = [_group(conditions=[_condition(field="userplaycount", operator="gte", value="nope")])]
        assert apply_filters(tracks, groups) == []


class TestTagOperations:
    def test_contains_with_count_min(self):
        tracks = [
            _track(title="rocky", artist_tags=[{"name": "rock", "count": 60}]),
            _track(title="weak", artist_tags=[{"name": "rock", "count": 10}]),
        ]
        groups = [_group(conditions=[_condition(field="tags", operator="contains", value="rock", countMin=50)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["rocky"]

    def test_not_contains(self):
        tracks = [
            _track(title="rocky", artist_tags=[{"name": "rock", "count": 60}]),
            _track(title="poppy", artist_tags=[{"name": "pop", "count": 60}]),
        ]
        groups = [_group(conditions=[_condition(field="tags", operator="not_contains", value="rock")])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["poppy"]

    def test_tag_eq(self):
        tracks = [
            _track(title="rocky", artist_tags=[{"name": "rock", "count": 60}]),
            _track(title="poppy", artist_tags=[{"name": "pop", "count": 60}]),
        ]
        groups = [_group(conditions=[_condition(field="tags", operator="eq", value="rock")])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["rocky"]

    def test_album_tag_source(self):
        tracks = [_track(title="a", album_tags=[{"name": "metal", "count": 80}], artist_tags=[])]
        groups = [_group(conditions=[_condition(field="tags", operator="contains", value="metal", tagSource="album")])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a"]

    def test_tag_case_insensitive(self):
        tracks = [_track(title="a", artist_tags=[{"name": "Rock", "count": 60}])]
        groups = [_group(conditions=[_condition(field="tags", operator="contains", value="rock")])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a"]


class TestUserloved:
    def test_is_true(self):
        tracks = [_track(title="loved", userloved=True), _track(title="not", userloved=False)]
        groups = [_group(conditions=[_condition(field="userloved", operator="is", value=True)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["loved"]

    def test_is_false(self):
        tracks = [_track(title="loved", userloved=True), _track(title="not", userloved=False)]
        groups = [_group(conditions=[_condition(field="userloved", operator="is", value=False)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["not"]


class TestTimestamp:
    def test_within_days(self):
        now = int(time.time())
        tracks = [
            _track(title="recent", timestamp=now - 2 * 86400),
            _track(title="old", timestamp=now - 30 * 86400),
        ]
        groups = [_group(conditions=[_condition(field="timestamp", operator="within_days", value=7)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["recent"]

    def test_before(self):
        now = int(time.time())
        tracks = [
            _track(title="recent", timestamp=now - 2 * 86400),
            _track(title="old", timestamp=now - 30 * 86400),
        ]
        groups = [_group(conditions=[_condition(field="timestamp", operator="before", value=7)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["old"]

    def test_missing_timestamp_passes(self):
        # JS: Number(undefined) -> NaN -> `return field === "timestamp"` -> true
        tracks = [_track(title="no-ts")]
        groups = [_group(conditions=[_condition(field="timestamp", operator="within_days", value=7)])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["no-ts"]


class TestGroupLogic:
    def test_and_group(self):
        tracks = [
            _track(title="both", userplaycount=20, userloved=True),
            _track(title="one", userplaycount=20, userloved=False),
        ]
        groups = [_group(conditions=[
            _condition(field="userplaycount", operator="gte", value=10),
            _condition(field="userloved", operator="is", value=True),
        ])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["both"]

    def test_or_group(self):
        tracks = [
            _track(title="a", userplaycount=20, userloved=False),
            _track(title="b", userplaycount=1, userloved=True),
            _track(title="c", userplaycount=1, userloved=False),
        ]
        groups = [_group(logic="OR", conditions=[
            _condition(field="userplaycount", operator="gte", value=10),
            _condition(field="userloved", operator="is", value=True),
        ])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a", "b"]

    def test_nested_groups(self):
        tracks = [
            _track(title="a", userplaycount=20, userloved=False),
            _track(title="b", userplaycount=1, userloved=True),
            _track(title="c", userplaycount=1, userloved=False),
        ]
        groups = [_group(
            logic="AND",
            conditions=[_condition(field="userplaycount", operator="gte", value=0)],
            groups=[_group(logic="OR", conditions=[
                _condition(field="userplaycount", operator="gte", value=10),
                _condition(field="userloved", operator="is", value=True),
            ])],
        )]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a", "b"]

    def test_top_level_groups_are_or(self):
        tracks = [
            _track(title="a", userplaycount=20, userloved=False),
            _track(title="b", userplaycount=1, userloved=True),
            _track(title="c", userplaycount=1, userloved=False),
        ]
        groups = [
            _group(conditions=[_condition(field="userplaycount", operator="gte", value=10)]),
            _group(conditions=[_condition(field="userloved", operator="is", value=True)]),
        ]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a", "b"]

    def test_empty_group_passes_all(self):
        tracks = [_track(title="a"), _track(title="b")]
        groups = [_group(conditions=[], groups=[])]
        assert [t["title"] for t in apply_filters(tracks, groups)] == ["a", "b"]

    def test_no_filter_groups_returns_all(self):
        tracks = [_track(title="a"), _track(title="b")]
        assert apply_filters(tracks, []) == tracks
        assert apply_filters(tracks, None) == tracks


class TestCountActiveConditions:
    def test_counts_nested_conditions(self):
        groups = [
            _group(conditions=[_condition(), _condition()], groups=[_group(conditions=[_condition()])]),
            _group(conditions=[_condition()]),
        ]
        assert count_active_conditions(groups) == 4

    def test_zero_for_empty(self):
        assert count_active_conditions([]) == 0
        assert count_active_conditions(None) == 0


def test_runner_uses_server_filters():
    """The shared runner applies the filter tree to sample tracks (JS parity)."""
    tracks = [
        _track(title="low", userplaycount=5),
        _track(title="high", userplaycount=20, userloved=True),
    ]
    filter_groups = [_group(conditions=[_condition(field="userplaycount", operator="gte", value=10)])]
    with patch("services.automation_runner.get_top_tracks", return_value=tracks), patch(
        "services.automation_runner.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
    ):
        result = run_automation_pipeline("user", "top_tracks", "3m", filter_groups, max_tracks=50)
    assert result["total"] == 1
    assert result["tracks"][0]["title"] == "high"
    assert result["before_filter"] == 2
    assert len(result["source_tracks"]) == 2