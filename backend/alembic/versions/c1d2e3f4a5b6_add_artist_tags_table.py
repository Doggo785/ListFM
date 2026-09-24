"""add artist_tags table for cached artist folksonomy tags

Revision ID: c1d2e3f4a5b6
Revises: 7c8d9e0f1a2b
Create Date: 2026-09-23

Artist tags are fetched per artist (not per track) and shared across that
artist's tracks. They had no persistent home (only in-memory per enrich
run); this table gives them one with per-row fetched_at for TTL freshness
(P1-8 enrich cache).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: str | Sequence[str] | None = '7c8d9e0f1a2b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'artist_tags',
        sa.Column('artist', sa.String(500), primary_key=True),
        sa.Column('tag_id', sa.String(36), sa.ForeignKey('tags.id'), primary_key=True),
        sa.Column('weight', sa.Integer),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_artist_tags_artist', 'artist_tags', ['artist'])


def downgrade() -> None:
    op.drop_index('idx_artist_tags_artist', table_name='artist_tags')
    op.drop_table('artist_tags')
