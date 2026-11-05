from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from schemas import AutomationCreate, cron_trigger

# A Wednesday at midnight: its own 08:00 comes first.
START = datetime(2026, 11, 4, tzinfo=UTC)


def next_days(cron: str, count: int = 1) -> list[str]:
    trigger = cron_trigger(cron, UTC)
    days, previous, now = [], None, START
    for _ in range(count):
        fire = trigger.get_next_fire_time(previous, now)
        days.append(fire.strftime("%a"))
        previous, now = fire, fire
    return days


@pytest.mark.parametrize(
    ("weekday", "expected"),
    [
        ("1", ["Mon"]),
        ("0", ["Sun"]),
        ("7", ["Sun"]),
        ("mon", ["Mon"]),
        ("1-5", ["Wed", "Thu", "Fri", "Mon", "Tue"]),
        ("5-7", ["Fri", "Sat", "Sun"]),
        ("0-2", ["Sun", "Mon", "Tue"]),
        ("1,3", ["Wed", "Mon"]),
        ("*/2", ["Thu", "Sat", "Sun", "Tue"]),
    ],
)
def test_a_weekday_means_what_cron_says(weekday, expected):
    assert next_days(f"0 8 * * {weekday}", len(expected)) == expected


def test_other_fields_are_untouched():
    assert cron_trigger("0 8 * * *", UTC).get_next_fire_time(None, START).strftime("%a %H") == "Wed 08"
    assert cron_trigger("0 0 1 */3 *", UTC).get_next_fire_time(None, START).strftime("%m-%d") == "01-01"


@pytest.mark.parametrize("cron", ["0 8 * * 8", "0 8 * * 1-9", "0 8", "nope"])
def test_a_bad_schedule_is_refused(cron):
    with pytest.raises(ValidationError):
        AutomationCreate(name="x", cron=cron)
