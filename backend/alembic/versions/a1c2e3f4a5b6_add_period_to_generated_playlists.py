"""add period to generated playlists

Revision ID: a1c2e3f4a5b6
Revises: c6d7e8f9a0b1
Create Date: 2026-11-05

The dates a playlist covers tell apart the playlists of one automation. Older
playlists keep both columns empty: their window was not recorded.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1c2e3f4a5b6'
down_revision: str | Sequence[str] | None = 'c6d7e8f9a0b1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('generated_playlists', sa.Column('period_start', sa.Date(), nullable=True))
    op.add_column('generated_playlists', sa.Column('period_end', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('generated_playlists', 'period_end')
    op.drop_column('generated_playlists', 'period_start')
