"""add timezone to users for cron schedules in local time

Revision ID: b1c2d3e4f5a6
Revises: 7abd037936a6
Create Date: 2026-11-03

Cron expressions were read in UTC while the UI shows them as local time.
Each user now carries an IANA zone (sent by their browser); existing rows
start at UTC, which is exactly how their schedules ran until now.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: str | Sequence[str] | None = '7abd037936a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(64), nullable=False, server_default='UTC'),
    )


def downgrade() -> None:
    op.drop_column('users', 'timezone')
