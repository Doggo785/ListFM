"""drop removed filter options

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-11-04

The rank field and the neq, gt and lt operators are gone, and a tag no longer
has an eq operator. Stored automations are validated when read, so their
filters must not keep any of these: gt and lt become the equivalent gte and
lte, eq on a tag becomes contains, the rest is dropped.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c6d7e8f9a0b1'
down_revision: str | Sequence[str] | None = 'b5c6d7e8f9a0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _converted(condition: dict) -> dict | None:
    field, operator, value = condition.get("field"), condition.get("operator"), condition.get("value")
    if field == "rank" or operator == "neq":
        return None
    if field == "tags" and operator == "eq":
        return {**condition, "operator": "contains"}
    if operator in ("gt", "lt"):
        if not isinstance(value, int | float) or isinstance(value, bool):
            return None
        return {**condition, "operator": "gte", "value": value + 1} if operator == "gt" else {
            **condition, "operator": "lte", "value": value - 1
        }
    if operator in ("contains", "not_contains") and field != "tags":
        return None
    return condition


def _converted_group(group: dict) -> dict:
    conditions = [_converted(c) for c in group.get("conditions") or []]
    return {
        **group,
        "conditions": [c for c in conditions if c is not None],
        "groups": [_converted_group(g) for g in group.get("groups") or []],
    }


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, filter_groups FROM automations")).all()
    for automation_id, groups in rows:
        converted = [_converted_group(g) for g in groups or []]
        if converted != groups:
            bind.execute(
                sa.text("UPDATE automations SET filter_groups = CAST(:groups AS JSONB) WHERE id = :id"),
                {"groups": json.dumps(converted), "id": automation_id},
            )


def downgrade() -> None:
    # The removed options are not restored: nothing to undo.
    pass
