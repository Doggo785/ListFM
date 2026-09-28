# services/ — Business Logic Layer

## OVERVIEW

Last.fm API wrapping, JWT/password utilities, and in-memory rate limiting.

## FILE MAP

| File | Lines | Role |
|---|---|---|
| `auth.py` | 42 | JWT create/decode + bcrypt hashing via passlib. 5 utility functions (`hash_password`, `verify_password`, `create_access_token`, `create_refresh_token`, `decode_token`). No session management or domain logic. |
| `lastfm.py` | 236 | `pylast` wrapper — the core data pipeline. Public functions: `get_user_info`, `get_recent_tracks`, `get_top_tags`, `get_top_tracks`, `get_top_artists_tracks`, `get_loved_tracks`, `get_track_full_info`, `enrich_tracks`, `deduplicate`. Internal: `get_network`, `_normalize_tags`. All synchronous. |
| `rate_limit.py` | 34 | Token-bucket rate limiter class with 3 pre-configured instances: login (10 req/60s), register (3 req/6h), refresh (20 req/60s). Process-local memory only, no Redis. Resets on restart, doesn't span workers. |

## HOTSPOTS

- **`get_track_full_info()` (lines 123-199)** — 79 lines with 11 `try/except` blocks, the most exception-dense function in the project. Each of 7 Last.fm properties (listeners, global_playcount, userplaycount, userloved, artist_tags, album_tags, album lookup) is fetched and caught individually. Implements a two-level tag cache (artist + album) shared via `enrich_tracks()` to deduplicate API calls. Sequential `pylast` calls per track mean elevated latency on slow responses.

- **`enrich_tracks()` (lines 202-225)** — `ThreadPoolExecutor(max_workers=5)` for parallel tag enrichment. Shares tag caches across threads. Any failed enrichment silently returns the unenriched track dict.

- **`rate_limit.py`** — Singleton limiters are process-local; under multiple workers or restarts, counters reset and clients can exceed intended limits between restarts.

## NOTES

- `services/auth.py` holds JWT/password utilities only — token rotation/session logic lives in `routers/auth.py`. Known gap flagged in root anti-patterns.
- `lastfm.py` is synchronous `pylast`. FastAPI routes must wrap calls to avoid blocking the event loop.
- `rate_limit.py` is the only in-process state in the project. No external cache backs it.
