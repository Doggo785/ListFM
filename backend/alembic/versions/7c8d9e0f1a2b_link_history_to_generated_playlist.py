"""link automation_history to the generated playlist of each run

Revision ID: 7c8d9e0f1a2b
Revises: 2b3f4d5e6a70
Create Date: 2026-09-23

Each successful automation run persists a GeneratedPlaylist row (P1-6).
This nullable FK lets the run history open the exact playlist it produced
(tracks + tags snapshot), instead of matching by timestamp proximity.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7c8d9e0f1a2b'
down_revision: str | Sequence[str] | None = '2b3f4d5e6a70'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'automation_history',
        sa.Column('generated_playlist_id', sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        'fk_automation_history_generated_playlist',
        'automation_history',
        'generated_playlists',
        ['generated_playlist_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_automation_history_generated_playlist',
        'automation_history',
        type_='foreignkey',
    )
    op.drop_column('automation_history', 'generated_playlist_id')
