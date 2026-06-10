"""create automations table

Revision ID: ebdcd09e7870
Revises: 
Create Date: 2026-06-08 16:43:00.255019

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'ebdcd09e7870'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'automations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(255), index=True),
        sa.Column('name', sa.String(255)),
        sa.Column('description', sa.String(1000), server_default=''),
        sa.Column('source_type', sa.String(50)),
        sa.Column('source_period', sa.String(20)),
        sa.Column('cron', sa.String(100), server_default=''),
        sa.Column('filter_groups', JSONB, server_default='[]'),
        sa.Column('output_max_size', sa.Integer, server_default='50'),
        sa.Column('enabled', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_run', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('automations')
