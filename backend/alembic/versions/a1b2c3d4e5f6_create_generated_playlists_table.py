"""create generated_playlists table

Revision ID: a1b2c3d4e5f6
Revises: ebdcd09e7870
Create Date: 2026-06-08 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'ebdcd09e7870'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'generated_playlists',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('automation_id', sa.String(36), sa.ForeignKey('automations.id'), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('source_period', sa.String(20), nullable=False),
        sa.Column('tracks', JSONB, nullable=False),
        sa.Column('track_count', sa.Integer, nullable=False),
        sa.Column('filter_groups', JSONB, nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('idx_gp_username', 'generated_playlists', ['username'])
    op.create_index('idx_gp_automation', 'generated_playlists', ['automation_id'])
    op.create_index('idx_gp_generated_at', 'generated_playlists', [sa.text('generated_at DESC')])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('generated_playlists')
