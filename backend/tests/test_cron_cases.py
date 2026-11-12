import json
from pathlib import Path

import pytest
from schemas import _validate_cron

# Shared with the editor's tests: both sides must refuse the same schedules.
CASES = json.loads((Path(__file__).resolve().parents[2] / "frontend/src/lib/cron-cases.json").read_text())


@pytest.mark.parametrize("cron", CASES["valid"])
def test_the_server_accepts_what_the_editor_accepts(cron):
    assert _validate_cron(cron) == cron


@pytest.mark.parametrize("cron", CASES["invalid"])
def test_the_server_refuses_what_the_editor_refuses(cron):
    with pytest.raises(ValueError):
        _validate_cron(cron)
