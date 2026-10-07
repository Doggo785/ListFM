"""add tags_fetched_at to tracks for per-group cache freshness

Revision ID: 7abd037936a6
Revises: a9c4e2f1b7d3
Create Date: 2026-10-07

The enrich cache used to trust tags implicitly whenever the track row was
fresh (all-or-nothing pact). This column makes the pact explicit: tags are
usable only when tags_fetched_at is fresh. Backfill copies last_fetched_at
(both were always written atomically), so existing rows keep their exact
read verdicts; only never-verified rows (NULL) newly miss.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7abd037936a6'
down_revision: str | Sequence[str] | None = 'a9c4e2f1b7d3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'tracks',
        sa.Column('tags_fetched_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "UPDATE tracks SET tags_fetched_at = last_fetched_at "
        "WHERE last_fetched_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column('tracks', 'tags_fetched_at')
