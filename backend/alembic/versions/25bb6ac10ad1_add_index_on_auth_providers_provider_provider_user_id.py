"""add index on auth_providers(provider, provider_user_id)

Revision ID: 25bb6ac10ad1
Revises: fb0adb70809f
Create Date: 2026-07-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '25bb6ac10ad1'
down_revision: Union[str, Sequence[str], None] = 'fb0adb70809f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_auth_providers_provider_provider_user_id "
        "ON auth_providers (provider, provider_user_id)"
    )


def downgrade() -> None:
    op.drop_index('ix_auth_providers_provider_provider_user_id', table_name='auth_providers')
