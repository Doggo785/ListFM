"""add scrobbles

Revision ID: d1e2f3a4b5c6
Revises: c2d3e4f5a6b7
Create Date: 2026-11-03

ADR 0001: each user's full listening history is stored locally. About
220 bytes per listen with the varchar(36) ids (5M listens ~ 1.1 GB).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: str | Sequence[str] | None = 'c2d3e4f5a6b7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'scrobbles',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('played_at', sa.DateTime(timezone=True), primary_key=True),
        sa.Column('track_id', sa.String(36), sa.ForeignKey('tracks.id'), primary_key=True),
    )
    op.add_column('users', sa.Column('scrobbles_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('scrobbles_complete_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'scrobbles_complete_at')
    op.drop_column('users', 'scrobbles_synced_at')
    op.drop_table('scrobbles')
