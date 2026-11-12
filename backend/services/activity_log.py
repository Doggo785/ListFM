"""One readable console line per step of the app's work: syncs, tags, runs, Last.fm calls.

Never pass a Last.fm URL or an exception's message here: httpx errors carry the
URL, and the URL carries the API key. An exception's class name is safe.
"""

import json
import logging

logger = logging.getLogger("listfm")
logger.setLevel(logging.INFO)
logger.propagate = False  # no "date INFO name:" prefix from the root handler
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(_handler)


def log_activity(kind: str, subject: str, detail: str) -> None:
    logger.info("%-6s %-9s %s", kind, subject, detail)


def automation_label(name: str) -> str:
    """The name in quotes, a line break escaped: a name cannot forge a log line."""
    return json.dumps(name, ensure_ascii=False)


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f} s"
    minutes, rest = divmod(int(seconds), 60)
    return f"{minutes} min {rest} s"


def pipeline_summary(result: dict, seconds: float) -> str:
    return (
        f"{result['before_filter']} → {result['after_filter']} → {result['total']} tracks"
        f"  {format_duration(seconds)}"
    )
