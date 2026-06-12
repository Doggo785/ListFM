"""add unique constraints on tracks and albums

Revision ID: d4e5f6a7b8c9
Revises: f0e1d2c3b4a5
Create Date: 2026-06-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'f0e1d2c3b4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Deduplicate existing tracks before adding constraint (keep oldest)
    op.execute("""
        DELETE FROM tracks t1
        USING tracks t2
        WHERE t1.artist = t2.artist
          AND t1.title = t2.title
          AND t1.created_at > t2.created_at
    """)

    # Deduplicate existing albums before adding constraint (keep oldest)
    op.execute("""
        DELETE FROM albums a1
        USING albums a2
        WHERE a1.artist = a2.artist
          AND a1.title = a2.title
          AND a1.created_at > a2.created_at
    """)

    # Add unique constraint on tracks(artist, title)
    op.create_unique_constraint(
        'uq_tracks_artist_title',
        'tracks',
        ['artist', 'title'],
    )

    # Add unique constraint on albums(title, artist)
    op.create_unique_constraint(
        'uq_albums_title_artist',
        'albums',
        ['title', 'artist'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_tracks_artist_title', 'tracks', type_='unique')
    op.drop_constraint('uq_albums_title_artist', 'albums', type_='unique')
