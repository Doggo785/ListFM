"""automation limits

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-04

GLOSSARY Limite: a maximum per artist, and no repeat over the automation's
last playlists. Both nullable, null meaning no limit.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: str | Sequence[str] | None = 'e2f3a4b5c6d7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('automations', sa.Column('output_max_per_artist', sa.Integer(), nullable=True))
    op.add_column('automations', sa.Column('output_no_repeat_playlists', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('automations', 'output_no_repeat_playlists')
    op.drop_column('automations', 'output_max_per_artist')
