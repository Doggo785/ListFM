"""add scheduled_for and attempt to automation_history for bounded retries

Revision ID: e5f6a7b8c9d0
Revises: c1d2e3f4a5b6
Create Date: 2026-09-24

P1-7 bounded retry: each run records when it was decided (scheduled_for)
separately from when the pipeline actually started (started_at), plus which
attempt of its chain it is (1 = initial). A retry reuses the chain's
scheduled_for with attempt+1; the UI shows "prevu le / execute le".
Backfill: existing rows get scheduled_for = started_at, attempt = 1.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'automation_history',
        sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'automation_history',
        sa.Column('attempt', sa.Integer, server_default='1', nullable=False),
    )
    op.execute(
        'UPDATE automation_history SET scheduled_for = started_at '
        'WHERE scheduled_for IS NULL'
    )
    op.alter_column('automation_history', 'scheduled_for', nullable=False)
    op.create_index(
        'idx_ah_retry_eligible', 'automation_history',
        ['status', 'attempt', 'automation_id'],
    )


def downgrade() -> None:
    op.drop_index('idx_ah_retry_eligible', table_name='automation_history')
    op.drop_column('automation_history', 'attempt')
    op.drop_column('automation_history', 'scheduled_for')
