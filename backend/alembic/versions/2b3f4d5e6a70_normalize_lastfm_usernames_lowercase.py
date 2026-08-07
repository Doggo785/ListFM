"""normalize last.fm usernames to lowercase

Revision ID: 2b3f4d5e6a70
Revises: 25bb6ac10ad1
Create Date: 2026-08-06 12:00:00.000000

Last.fm usernames are case-insensitive at the service. Previously the linked
provider_user_id preserved the caller's casing, so two users could link the
same Last.fm account via casing variants ("Alice" vs "alice") and the unique
(provider, provider_user_id) index would not catch them. This migration
normalizes existing lastfm providers to lowercase and, where a case-variant
collision already exists, soft-keeps the earliest-linked account.

The case normalization must match the application-level normalization in
link_lastfm (body.username.strip().lower()) and get_user_by_lastfm_username
(func.lower(...)).
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '2b3f4d5e6a70'
down_revision: Union[str, Sequence[str], None] = '25bb6ac10ad1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove case-variant duplicates: for each (provider='lastfm',
    # LOWER(provider_user_id)) group keep at most one row, preferring a row
    # whose user is not soft-deleted and then the earliest-linked. Without this
    # the unique (provider, provider_user_id) index would reject the lowercase
    # UPDATE below; the app never creates such duplicates anymore.
    op.execute(
        """
        DELETE FROM auth_providers ap
        WHERE ap.provider = 'lastfm'
          AND EXISTS (
              SELECT 1 FROM auth_providers candidate
              WHERE candidate.provider = 'lastfm'
                AND LOWER(candidate.provider_user_id) = LOWER(ap.provider_user_id)
                AND candidate.id <> ap.id
                AND (
                    -- keep a row pointing at a live user over a soft-deleted one
                    (
                        EXISTS (
                            SELECT 1 FROM users u
                            WHERE u.id = candidate.user_id AND u.deleted_at IS NULL
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM users u
                            WHERE u.id = ap.user_id AND u.deleted_at IS NULL
                        )
                    )
                    OR
                    -- otherwise keep the earliest-linked row
                    (
                        EXISTS (
                            SELECT 1 FROM users u
                            WHERE u.id = ap.user_id AND u.deleted_at IS NULL
                        ) = EXISTS (
                            SELECT 1 FROM users u
                            WHERE u.id = candidate.user_id AND u.deleted_at IS NULL
                        )
                        AND candidate.linked_at < ap.linked_at
                    )
                )
          )
        """
    )

    # Normalize remaining usernames to lowercase.
    op.execute(
        "UPDATE auth_providers SET provider_user_id = LOWER(provider_user_id) WHERE provider = 'lastfm'"
    )


def downgrade() -> None:
    # Lowercasing is lossy; the original mixed-case values cannot be restored.
    pass