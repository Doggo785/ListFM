# backend/repositories/

## Overview

Data access layer for ListFM: 8 files providing read/write operations against the PostgreSQL schema.

## File Map

| File | Lines | Role |
|------|-------|------|
| `users.py` | 235 | User CRUD + auth provider management (email, Last.fm, Google, Discord) |
| `tracks.py` | 86 | Track lookups (by ID, by artist+title) with `get_or_create_track` using `SELECT FOR UPDATE` and 24h cache TTL |
| `albums.py` | 58 | Album lookups mirroring tracks pattern: `get_or_create_album` with `SELECT FOR UPDATE` + 24h cache TTL |
| `tags.py` | 122 | Tag CRUD using `INSERT ... ON CONFLICT`; upsert functions for track-tag and album-tag associations |
| `user_tracks.py` | 110 | User-track relationship records: playcount, loved status, sync state, last played timestamps |
| `automations.py` | 100 | Full CRUD for automation rules with user-scoped queries |
| `generated_playlists.py` | 88 | Full CRUD for saved playlists; creates `PlaylistTrack` junction records in the same transaction |
| `refresh_tokens.py` | 51 | Refresh token rows: `create_refresh_token`, `get_refresh_token_by_hash`, `revoke_refresh_token_family` |

## Patterns

- **Signature contract**: Every function accepts `db: AsyncSession` as first param. The caller is responsible for committing. Functions return the ORM model or `None` (not found).
- **Soft-delete filters**: All queries filter with `Model.deleted_at.is_(None)`. Tracks and albums are the exception (no soft-delete on those tables).
- **`updated_at` discipline**: Set manually via `datetime.now(timezone.utc)` before `flush()`. No SQLAlchemy event listeners or `onupdate` defaults.
- **Concurrency**: Tracks and albums use `SELECT FOR UPDATE` to prevent duplicate race conditions. Tags and user_tracks use PostgreSQL `INSERT ... ON CONFLICT` (upsert) instead.
- **No abstraction layer**: No Data Mapper, no Unit of Work, no base repository class. Each file is a flat collection of free functions. All identifiers (uuids, timestamps) are generated in application code, not by the database.
- **Cross-file calls**: `generated_playlists.py` imports `repositories.tracks.get_or_create_track` directly. Repos call other repos freely with the same `db` session, keeping operations in one transaction.

## Hotspots

- **users.py:111-196** -- `_get_or_create_user_from_provider()` is the shared provider-creation helper. `get_or_create_user_from_google()` (199-209) and `get_or_create_user_from_discord()` (212-222) are thin wrappers that pass the provider name string. The former 67-line near-identical copies were merged into this single helper.
