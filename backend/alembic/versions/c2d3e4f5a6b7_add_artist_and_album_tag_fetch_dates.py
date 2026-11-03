"""add artist and album tag fetch dates

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-03

The enrich cache was all-or-nothing per track: a new track by a known
artist refetched artist.getTopTags and album.getTopTags. These dates let
fresh artist and album tags be reused across tracks. No backfill: each
artist and album is refetched once, then cached.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: str | Sequence[str] | None = 'b1c2d3e4f5a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'artists',
        sa.Column('name', sa.String(500), primary_key=True),
        sa.Column('tags_fetched_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column(
        'albums',
        sa.Column('tags_fetched_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('albums', 'tags_fetched_at')
    op.drop_table('artists')
