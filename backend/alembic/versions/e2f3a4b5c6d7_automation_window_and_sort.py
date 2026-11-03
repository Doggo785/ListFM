"""automation window and sort

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-11-03

ADR 0002: an automation reads the user's listens through a window and a
sort instead of one of four Last.fm sources. Existing automations were
tests: they are wiped with their playlists and history, no migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: str | Sequence[str] | None = 'd1e2f3a4b5c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM automation_history")
    op.execute("DELETE FROM playlist_tracks")
    op.execute("DELETE FROM generated_playlists")
    op.execute("DELETE FROM automations")
    op.drop_column('automations', 'source_type')
    op.drop_column('automations', 'source_period')
    op.add_column('automations', sa.Column('window', postgresql.JSONB(), nullable=False))
    op.add_column('automations', sa.Column('sort', sa.String(30), nullable=False))


def downgrade() -> None:
    op.execute("DELETE FROM automation_history")
    op.execute("DELETE FROM playlist_tracks")
    op.execute("DELETE FROM generated_playlists")
    op.execute("DELETE FROM automations")
    op.drop_column('automations', 'sort')
    op.drop_column('automations', 'window')
    op.add_column('automations', sa.Column('source_type', sa.String(50), nullable=False))
    op.add_column('automations', sa.Column('source_period', sa.String(20), nullable=False))
