"""mail_links: the links sent by email to confirm an address or reset a password

Accounts that exist before email confirmation count as confirmed: they were
made before the check existed, and only test databases hold any.

Revision ID: e7c1a9d3f584
Revises: d8b2f4a6c913
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7c1a9d3f584"
down_revision: str | Sequence[str] | None = "d8b2f4a6c913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mail_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("purpose", sa.String(10), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mail_links_user_id", "mail_links", ["user_id"])
    op.execute("UPDATE users SET email_verified = true WHERE email IS NOT NULL AND password_hash IS NOT NULL")


def downgrade() -> None:
    op.drop_index("ix_mail_links_user_id", table_name="mail_links")
    op.drop_table("mail_links")
