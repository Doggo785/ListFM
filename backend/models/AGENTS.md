# Models — `backend/models/`

## Overview

13 SQLAlchemy ORM models backing users, tracks, tags, albums, automations, and playlists for the Last.fm playlist engine.

## Structure

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | Core user account with email, password hash, role, display name, soft-delete |
| `AuthProvider` | `auth_providers` | OAuth/linker rows per user (email, Last.fm, Google, Discord) |
| `RefreshToken` | `refresh_tokens` | JWT refresh tokens with rotation families and reuse detection |
| `Track` | `tracks` | Deduplicated tracks keyed by (artist, title); nullable album FK for cache |
| `Album` | `albums` | Deduplicated albums keyed by (title, artist); tracks reference |
| `Tag` | `tags` | Genre/folksonomy tags; unique by name |
| `TrackTag` | `track_tags` | M2M junction: tracks to tags with normalized weight (0-100) |
| `AlbumTag` | `album_tags` | M2M junction: albums to tags with normalized weight (0-100) |
| `UserTrack` | `user_tracks` | Per-user track stats: playcount, loved flag, last played, sync timestamps |
| `Automation` | `automations` | Playlist generation rules: source type/period, filter tree (JSONB), cron, soft-delete |
| `GeneratedPlaylist` | `generated_playlists` | Output of an automation run; snapshots filter groups at generation time, soft-delete |
| `PlaylistTrack` | `playlist_tracks` | Ordered M2M junction: playlists to tracks with position |
| `AutomationHistory` | `automation_history` | Execution log per automation run: status, track counts, error, filter snapshot |

## Key Relationships

```
User ──1:N── AuthProvider     (oauth/linker rows, email or Last.fm)
User ──1:N── RefreshToken     (rotation families, self-referencing chain via replaced_by)
User ──1:N── Automation       (playlist generation rules)
User ──1:N── GeneratedPlaylist (saved output, nullable automation_id FK)
User ──N:M── Track            (via UserTrack: playcount, loved, last_played)

Automation ──1:N── AutomationHistory   (execution logs)
Automation ──1:N── GeneratedPlaylist   (nullable — orphan playlists allowed)

Track ──N:M── Tag             (via TrackTag with weight)
Album  ──N:M── Tag            (via AlbumTag with weight)
Track ──N:1── Album           (nullable album_id FK)

GeneratedPlaylist ──N:M── Track  (via PlaylistTrack with position)
```

## Notes

- **UUID PKs everywhere**: All primary keys are `String(36)` with string UUIDs generated at the application layer (not DB-native UUID type).
- **Soft-delete via `deleted_at`**: Present on `User`, `Automation`, and `GeneratedPlaylist`. All queries should filter `WHERE deleted_at IS NULL`.
- **Timestamps**: Every model has `created_at` (server-default `now()`). Models with mutable data (`User`, `Automation`, `RefreshToken`) also carry `updated_at` with `onupdate`.
- **Automation source is flat**: `source_type`, `source_period`, and `output_max_size` are direct columns, not a nested object. The Pydantic schema reconstructs a `source` object via `model_validator`.
- **Filter storage**: `filter_groups` is `JSONB` on `Automation`, `GeneratedPlaylist`, and `AutomationHistory`. It stores a recursive filter tree whose schema lives on the frontend (`filter-engine.js`). No server-side validation of the filter structure.
- **No provider-token columns**: `AuthProvider` lost `access_token`, `refresh_token` and `token_expires_at` (migration `a9c4e2f1b7d3`, 2026-09-25) — no flow ever wrote them, and Codacy flagged the plaintext columns as a trap. If provider tokens ever need to persist, add the columns back encrypted at rest (e.g. Fernet TypeDecorator), never plaintext.
- **RefreshToken.replaced_by**: Self-referencing FK forming a rotation chain. When a token is rotated, the old token's `replaced_by` points to the new one. Combined with `family`, this enables reuse detection.
- **No ORM relationships declared**: None of these models define `relationship()` directives. All joins are done manually in repository/service layer via `select()` with `join()`.
