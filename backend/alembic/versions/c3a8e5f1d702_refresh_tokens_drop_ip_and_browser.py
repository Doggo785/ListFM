"""refresh_tokens: stop keeping the IP address and browser of each sign-in

Nothing read them; the privacy page promises they are not kept.

Revision ID: c3a8e5f1d702
Revises: 4b7d2e9a1c63
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a8e5f1d702"
down_revision: str | Sequence[str] | None = "4b7d2e9a1c63"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("refresh_tokens", "ip_address")
    op.drop_column("refresh_tokens", "user_agent")


def downgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("user_agent", sa.String(500), nullable=True))
    op.add_column("refresh_tokens", sa.Column("ip_address", sa.String(45), nullable=True))
