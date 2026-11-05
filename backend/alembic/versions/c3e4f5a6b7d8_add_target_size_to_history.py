"""add target size to automation history

Revision ID: c3e4f5a6b7d8
Revises: b2d3e4f5a6c7
Create Date: 2026-11-05

The size a run asked for, so "32/50" stays true after the automation changes.
Older runs keep no size: they show their track count alone.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3e4f5a6b7d8'
down_revision: str | Sequence[str] | None = 'b2d3e4f5a6c7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('automation_history', sa.Column('target_size', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('automation_history', 'target_size')
