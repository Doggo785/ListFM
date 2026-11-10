"""users.guide_done_at: when the newcomer's guide was finished or skipped

Revision ID: 4b7d2e9a1c63
Revises: 9e1f3a7c5b20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4b7d2e9a1c63"
down_revision: str | Sequence[str] | None = "9e1f3a7c5b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("guide_done_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "guide_done_at")
