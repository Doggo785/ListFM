"""add index on auth_providers(provider, provider_user_id)

Revision ID: 25bb6ac10ad1
Revises: d4e5f6a7b8c9
Create Date: 2026-07-23 15:00:00.000000

NOTE: this non-unique index is redundant with the UNIQUE index
idx_auth_providers_provider_user on (provider, provider_user_id) created by
f0e1d2c3b4a5. It is kept for history/back-compat only; do not rely on it for
uniqueness. Uniqueness integrity (op integrity, 409 on duplicate link) comes
from the base migration's UNIQUE index, not from this one.

Chain history: this revision previously followed fb0adb70809f, a no-op
"add auth tables" revision whose upgrade() was `pass`. fb0adb was deleted
(P0-5, 2026-09-23) and this revision was rewired onto d4e5f6a7b8c9. Safe for
every database already stamped at head (alembic only tracks the head
version); a database stamped mid-chain at fb0adb needs `alembic stamp`
to the new head chain before upgrading.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '25bb6ac10ad1'
down_revision: str | Sequence[str] | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_auth_providers_provider_provider_user_id "
        "ON auth_providers (provider, provider_user_id)"
    )


def downgrade() -> None:
    op.drop_index('ix_auth_providers_provider_provider_user_id', table_name='auth_providers')
