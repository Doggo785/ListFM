"""reset database with new schema

Revision ID: f0e1d2c3b4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-06-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'f0e1d2c3b4a5'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Reset database with new schema."""
    
    # Drop existing tables in reverse dependency order (IF EXISTS for safety)
    op.execute("DROP TABLE IF EXISTS playlist_tracks CASCADE")
    op.execute("DROP TABLE IF EXISTS automation_history CASCADE")
    op.execute("DROP TABLE IF EXISTS user_tracks CASCADE")
    op.execute("DROP TABLE IF EXISTS album_tags CASCADE")
    op.execute("DROP TABLE IF EXISTS track_tags CASCADE")
    op.execute("DROP TABLE IF EXISTS tags CASCADE")
    op.execute("DROP TABLE IF EXISTS tracks CASCADE")
    op.execute("DROP TABLE IF EXISTS albums CASCADE")
    op.execute("DROP TABLE IF EXISTS refresh_tokens CASCADE")
    op.execute("DROP TABLE IF EXISTS auth_providers CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS generated_playlists CASCADE")
    op.execute("DROP TABLE IF EXISTS automations CASCADE")
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=True),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('role', sa.String(20), server_default='user'),
        sa.Column('email_verified', sa.Boolean, server_default='false'),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_users_email', 'users', ['email'], unique=True, postgresql_where='email IS NOT NULL')
    op.create_index('idx_users_deleted_at', 'users', ['deleted_at'], postgresql_where='deleted_at IS NULL')
    
    # Create auth_providers table
    op.create_table(
        'auth_providers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), index=True),
        sa.Column('provider', sa.String(50)),
        sa.Column('provider_user_id', sa.String(255)),
        sa.Column('access_token', sa.String(500), nullable=True),
        sa.Column('refresh_token', sa.String(500), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('linked_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_auth_providers_provider_user', 'auth_providers', ['provider', 'provider_user_id'], unique=True)
    
    # Create refresh_tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), index=True),
        sa.Column('token_hash', sa.String(64), unique=True),
        sa.Column('family', sa.String(36), index=True),
        sa.Column('replaced_by', sa.String(36), nullable=True),
        sa.Column('revoked', sa.Boolean, server_default='false'),
        sa.Column('expires_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )
    op.create_index('idx_refresh_tokens_user', 'refresh_tokens', ['user_id'])
    op.create_index('idx_refresh_tokens_family', 'refresh_tokens', ['family'])
    
    # Create albums table
    op.create_table(
        'albums',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(500)),
        sa.Column('artist', sa.String(500)),
        sa.Column('last_fetched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_albums_artist', 'albums', ['artist'])
    op.create_index('idx_albums_last_fetched', 'albums', ['last_fetched_at'])
    
    # Create tracks table
    op.create_table(
        'tracks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(500)),
        sa.Column('artist', sa.String(500)),
        sa.Column('album_id', sa.String(36), sa.ForeignKey('albums.id'), nullable=True),
        sa.Column('listeners', sa.Integer, server_default='0'),
        sa.Column('global_playcount', sa.Integer, server_default='0'),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('last_fetched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_tracks_artist', 'tracks', ['artist'])
    op.create_index('idx_tracks_album', 'tracks', ['album_id'])
    op.create_index('idx_tracks_last_fetched', 'tracks', ['last_fetched_at'])
    
    # Create tags table
    op.create_table(
        'tags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_tags_name', 'tags', ['name'], unique=True)
    
    # Create track_tags table
    op.create_table(
        'track_tags',
        sa.Column('track_id', sa.String(36), sa.ForeignKey('tracks.id'), primary_key=True),
        sa.Column('tag_id', sa.String(36), sa.ForeignKey('tags.id'), primary_key=True),
        sa.Column('weight', sa.Integer),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_track_tags_track', 'track_tags', ['track_id'])
    op.create_index('idx_track_tags_tag', 'track_tags', ['tag_id'])
    
    # Create album_tags table
    op.create_table(
        'album_tags',
        sa.Column('album_id', sa.String(36), sa.ForeignKey('albums.id'), primary_key=True),
        sa.Column('tag_id', sa.String(36), sa.ForeignKey('tags.id'), primary_key=True),
        sa.Column('weight', sa.Integer),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_album_tags_album', 'album_tags', ['album_id'])
    op.create_index('idx_album_tags_tag', 'album_tags', ['tag_id'])
    
    # Create user_tracks table
    op.create_table(
        'user_tracks',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('track_id', sa.String(36), sa.ForeignKey('tracks.id'), primary_key=True),
        sa.Column('user_playcount', sa.Integer, server_default='0'),
        sa.Column('userloved', sa.Boolean, server_default='false'),
        sa.Column('last_played_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_user_tracks_user', 'user_tracks', ['user_id'])
    op.create_index('idx_user_tracks_track', 'user_tracks', ['track_id'])
    op.create_index('idx_user_tracks_user_played', 'user_tracks', ['user_id', sa.text('last_played_at DESC')])
    op.create_index('idx_user_tracks_synced', 'user_tracks', ['user_id', 'last_synced_at'])
    
    # Create automations table
    op.create_table(
        'automations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), index=True),
        sa.Column('lastfm_username', sa.String(255)),
        sa.Column('name', sa.String(255)),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('source_type', sa.String(50)),
        sa.Column('source_period', sa.String(20)),
        sa.Column('cron', sa.String(100), nullable=True),
        sa.Column('filter_groups', JSONB, server_default='[]'),
        sa.Column('output_max_size', sa.Integer, server_default='50'),
        sa.Column('enabled', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_run', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_automations_user', 'automations', ['user_id'])
    op.create_index('idx_automations_enabled', 'automations', ['enabled'], postgresql_where='enabled = true AND deleted_at IS NULL')
    op.create_index('idx_automations_cron', 'automations', ['cron'], postgresql_where="cron != '' AND enabled = true AND deleted_at IS NULL")
    
    # Create generated_playlists table
    op.create_table(
        'generated_playlists',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), index=True),
        sa.Column('automation_id', sa.String(36), sa.ForeignKey('automations.id'), nullable=True),
        sa.Column('lastfm_username', sa.String(255)),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('track_count', sa.Integer),
        sa.Column('filter_groups', JSONB, nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_gp_user', 'generated_playlists', ['user_id'])
    op.create_index('idx_gp_automation', 'generated_playlists', ['automation_id'])
    op.create_index('idx_gp_generated_at', 'generated_playlists', [sa.text('generated_at DESC')])
    
    # Create playlist_tracks table
    op.create_table(
        'playlist_tracks',
        sa.Column('playlist_id', sa.String(36), sa.ForeignKey('generated_playlists.id'), primary_key=True),
        sa.Column('track_id', sa.String(36), sa.ForeignKey('tracks.id'), primary_key=True),
        sa.Column('position', sa.Integer),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_playlist_tracks_playlist', 'playlist_tracks', ['playlist_id'])
    
    # Create automation_history table
    op.create_table(
        'automation_history',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('automation_id', sa.String(36), sa.ForeignKey('automations.id'), index=True),
        sa.Column('status', sa.String(20)),
        sa.Column('tracks_generated', sa.Integer, server_default='0'),
        sa.Column('tracks_before_filter', sa.Integer, server_default='0'),
        sa.Column('tracks_after_filter', sa.Integer, server_default='0'),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('filter_groups_used', JSONB, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_ah_automation', 'automation_history', ['automation_id'])
    op.create_index('idx_ah_started', 'automation_history', [sa.text('started_at DESC')])
    op.create_index('idx_ah_status', 'automation_history', ['status'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('automation_history')
    op.drop_table('playlist_tracks')
    op.drop_table('generated_playlists')
    op.drop_table('automations')
    op.drop_table('user_tracks')
    op.drop_table('album_tags')
    op.drop_table('track_tags')
    op.drop_table('tags')
    op.drop_table('tracks')
    op.drop_table('albums')
    op.drop_table('refresh_tokens')
    op.drop_table('auth_providers')
    op.drop_table('users')
