"""track albums

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-11-04

The sync now keeps each track's album (tracks.album_id already exists). Stored
listens were copied without it, so they are dropped and every account goes
back through its first load, which resumes on failure and holds runs until it
ends. Automations and playlists stay.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a4b5c6d7e8f9'
down_revision: str | Sequence[str] | None = 'f3a4b5c6d7e8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('automations', sa.Column('output_max_per_album', sa.Integer(), nullable=True))
    op.execute("DELETE FROM scrobbles")
    op.execute("UPDATE users SET scrobbles_synced_at = NULL, scrobbles_complete_at = NULL")


def downgrade() -> None:
    # The listens stay reloaded: nothing to restore.
    op.drop_column('automations', 'output_max_per_album')
