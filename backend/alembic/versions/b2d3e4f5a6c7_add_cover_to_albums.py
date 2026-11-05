"""add cover to albums

Revision ID: b2d3e4f5a6c7
Revises: a1c2e3f4a5b6
Create Date: 2026-11-05

Album art for the playlists' mosaics, looked up apart from the pipeline.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2d3e4f5a6c7'
down_revision: str | Sequence[str] | None = 'a1c2e3f4a5b6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('albums', sa.Column('image_url', sa.String(500), nullable=True))
    op.add_column('albums', sa.Column('image_fetched_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('albums', 'image_fetched_at')
    op.drop_column('albums', 'image_url')
