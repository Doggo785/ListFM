from repositories.users import (
    get_user_by_id,
    get_user_by_email,
    get_user_by_lastfm_username,
    get_lastfm_provider,
    create_user,
    create_user_from_lastfm,
    update_user,
    delete_user,
)
from repositories.refresh_tokens import (
    create_refresh_token,
    get_refresh_token_by_hash,
    revoke_refresh_token_family,
)
from repositories.tracks import (
    get_track_by_id,
    get_track_by_artist_title,
    get_or_create_track,
    upsert_track,
)
from repositories.albums import (
    get_album_by_id,
    get_album_by_title_artist,
    get_or_create_album,
)
from repositories.tags import (
    get_tag_by_name,
    get_or_create_tag,
    upsert_track_tag,
    upsert_album_tag,
    get_track_tags,
    get_album_tags,
)
from repositories.user_tracks import (
    get_user_track,
    upsert_user_track,
    get_user_tracks_needing_sync,
    update_last_played,
)
from repositories.automations import (
    get_automations,
    get_automation,
    create_automation,
    update_automation,
    delete_automation,
)
from repositories.generated_playlists import (
    get_generated_playlists,
    get_generated_playlist,
    create_generated_playlist,
    delete_generated_playlist,
)

__all__ = [
    # Users
    "get_user_by_id",
    "get_user_by_email",
    "get_user_by_lastfm_username",
    "get_lastfm_provider",
    "create_user",
    "create_user_from_lastfm",
    "update_user",
    "delete_user",
    # Refresh Tokens
    "create_refresh_token",
    "get_refresh_token_by_hash",
    "revoke_refresh_token_family",
    # Tracks
    "get_track_by_id",
    "get_track_by_artist_title",
    "get_or_create_track",
    "upsert_track",
    # Albums
    "get_album_by_id",
    "get_album_by_title_artist",
    "get_or_create_album",
    # Tags
    "get_tag_by_name",
    "get_or_create_tag",
    "upsert_track_tag",
    "upsert_album_tag",
    "get_track_tags",
    "get_album_tags",
    # User Tracks
    "get_user_track",
    "upsert_user_track",
    "get_user_tracks_needing_sync",
    "update_last_played",
    # Automations
    "get_automations",
    "get_automation",
    "create_automation",
    "update_automation",
    "delete_automation",
    # Generated Playlists
    "get_generated_playlists",
    "get_generated_playlist",
    "create_generated_playlist",
    "delete_generated_playlist",
]
