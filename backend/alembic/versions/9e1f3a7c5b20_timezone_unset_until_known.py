"""users.timezone is empty until the browser or the user sets it

Revision ID: 9e1f3a7c5b20
Revises: c3e4f5a6b7d8
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9e1f3a7c5b20"
down_revision: str | Sequence[str] | None = "c3e4f5a6b7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "timezone", existing_type=sa.String(64), nullable=True, server_default=None)


def downgrade() -> None:
    op.execute("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL")
    op.alter_column("users", "timezone", existing_type=sa.String(64), nullable=False, server_default="UTC")
