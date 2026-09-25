from repositories.albums import (
    get_album_by_id,
    get_album_by_title_artist,
    get_or_create_album,
)
from repositories.automations import (
    create_automation,
    delete_automation,
    get_automation,
    get_automations,
    update_automation,
)
from repositories.generated_playlists import (
    create_generated_playlist,
    delete_generated_playlist,
    get_generated_playlist,
    get_generated_playlists,
)
from repositories.refresh_tokens import (
    create_refresh_token,
    get_refresh_token_by_hash,
    revoke_refresh_token_family,
)
from repositories.tags import (
    get_album_tags,
    get_or_create_tag,
    get_tag_by_name,
    get_track_tags,
    upsert_album_tag,
    upsert_track_tag,
)
from repositories.tracks import (
    get_or_create_track,
    get_track_by_artist_title,
    get_track_by_id,
    upsert_track,
)
from repositories.user_tracks import (
    get_user_track,
    get_user_tracks_needing_sync,
    update_last_played,
    upsert_user_track,
)
from repositories.users import (
    create_user,
    delete_user,
    get_lastfm_provider,
    get_user_by_email,
    get_user_by_id,
    get_user_by_lastfm_username,
    update_user,
)

__all__ = [
    "create_automation",
    "create_generated_playlist",
    "create_refresh_token",
    "create_user",
    "delete_automation",
    "delete_generated_playlist",
    "delete_user",
    "get_album_by_id",
    "get_album_by_title_artist",
    "get_album_tags",
    "get_automation",
    "get_automations",
    "get_generated_playlist",
    "get_generated_playlists",
    "get_lastfm_provider",
    "get_or_create_album",
    "get_or_create_tag",
    "get_or_create_track",
    "get_refresh_token_by_hash",
    "get_tag_by_name",
    "get_track_by_artist_title",
    "get_track_by_id",
    "get_track_tags",
    "get_user_by_email",
    "get_user_by_id",
    "get_user_by_lastfm_username",
    "get_user_track",
    "get_user_tracks_needing_sync",
    "revoke_refresh_token_family",
    "update_automation",
    "update_last_played",
    "update_user",
    "upsert_album_tag",
    "upsert_track",
    "upsert_track_tag",
    "upsert_user_track",
]
