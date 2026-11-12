"""users.role: dropped, nothing ever read it (no admin exists)

Revision ID: d8b2f4a6c913
Revises: c3a8e5f1d702
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d8b2f4a6c913"
down_revision: str | Sequence[str] | None = "c3a8e5f1d702"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "role")


def downgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(20), server_default="user"))
