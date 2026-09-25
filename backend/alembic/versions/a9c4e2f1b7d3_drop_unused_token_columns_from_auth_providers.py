"""drop unused token columns from auth_providers

Revision ID: a9c4e2f1b7d3
Revises: e5f6a7b8c9d0
Create Date: 2026-09-25 00:00:00.000000

NOTE: access_token, refresh_token and token_expires_at existed since the
initial schema but no code path ever wrote them: the OAuth flow uses
provider tokens in memory (code exchange -> profile fetch) and discards
them. Codacy flagged the plaintext columns as a trap: anyone wiring a
token into them would store it unencrypted. The columns are empty, so
upgrade() only drops them. If provider tokens ever need to persist, add
the columns back encrypted at rest (e.g. Fernet TypeDecorator), never
plaintext.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9c4e2f1b7d3'
down_revision: str | Sequence[str] | None = 'e5f6a7b8c9d0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column('auth_providers', 'access_token')
    op.drop_column('auth_providers', 'refresh_token')
    op.drop_column('auth_providers', 'token_expires_at')


def downgrade() -> None:
    op.add_column('auth_providers', sa.Column('access_token', sa.String(length=500), nullable=True))
    op.add_column('auth_providers', sa.Column('refresh_token', sa.String(length=500), nullable=True))
    op.add_column(
        'auth_providers',
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
    )
