"""automation sort counts

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-11-04

Whether the sort counts every listen of the window or only those of the
automation's listening_moment filters.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b5c6d7e8f9a0'
down_revision: str | Sequence[str] | None = 'a4b5c6d7e8f9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('automations', sa.Column('sort_counts', sa.String(length=10), server_default='window', nullable=False))


def downgrade() -> None:
    op.drop_column('automations', 'sort_counts')
