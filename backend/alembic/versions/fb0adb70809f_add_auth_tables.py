"""add auth tables

Revision ID: fb0adb70809f
Revises: d4e5f6a7b8c9
Create Date: 2026-06-15 15:00:56.305767

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fb0adb70809f'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Auth tables (users, auth_providers, refresh_tokens) already exist
    from the reset migration (f0e1d2c3b4a5). This migration confirms
    their presence in the schema. No changes needed."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
