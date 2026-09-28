# services/ — Business Logic Layer

## OVERVIEW

Last.fm API wrapping, JWT/password utilities, in-memory rate limiting, plus the P1 automation pipeline (server-side filter engine, DB enrich cache, preview + sweep runner).

## FILE MAP

| File | Lines | Role |
|---|---|---|
| `auth.py` | 49 | JWT create/decode + bcrypt hashing via passlib. 6 utility functions (`hash_refresh_token`, `hash_password`, `verify_password`, `create_access_token`, `create_refresh_token`, `decode_token`). No session management or domain logic. |
| `lastfm.py` | 313 | `pylast` wrapper — the core data pipeline. Public functions: `get_user_info`, `get_recent_tracks`, `get_top_tags`, `get_top_tracks`, `get_top_artists_tracks`, `get_loved_tracks`, `get_track_full_info`, `enrich_tracks`, `deduplicate`. Internal: `get_network`, `_normalize_tags`, `_throttled_call` (~1s throttle + call counter). All synchronous. |
| `rate_limit.py` | 90 | Token-bucket rate limiter class with 7 pre-configured instances: login (10 req/60s), register (3 req/6h), register-per-email (3 req/6h), refresh (20 req/60s), link-lastfm, oauth-login, complete-email (10 req/60s each). Process-local memory only, no Redis. Resets on restart, doesn't span workers. |
| `filter_engine.py` | 180 | Server-side port of `frontend/src/lib/filter-engine.js` — same ops/semantics so preview and sweep share one source of truth. Accepts dicts or API request bodies. |
| `enrich_cache.py` | 223 | Async DB-backed enrich cache (per-user, 24h TTL). Bridge between sync `lastfm.py` and async routes/runner. |
| `automation_runner.py` | 454 | Preview + sweep pipeline: dispatch → deduplicate → enrich (cache first, live on misses) → server-side `apply_filters` → limit. Blocking pylast calls run in the default executor, never on the event loop. |

## HOTSPOTS

- **`get_track_full_info()` (lines 180-277)** — 98 lines with 8 `try/except` blocks, the most exception-dense function in the project. Each Last.fm property (listeners, global_playcount, userplaycount, userloved, artist_tags, album_tags, album lookup) is fetched and caught individually. Implements a two-level tag cache (artist + album) shared via `enrich_tracks()` to deduplicate API calls. Sequential `pylast` calls per track mean elevated latency on slow responses.

- **`enrich_tracks()` (lines 278-313)** — `ThreadPoolExecutor(max_workers=5)` for parallel tag enrichment. Shares tag caches across threads. Any failed enrichment silently returns the unenriched track dict.

- **`rate_limit.py`** — Singleton limiters are process-local; under multiple workers or restarts, counters reset and clients can exceed intended limits between restarts.

## NOTES

- `services/auth.py` holds JWT/password utilities only — token rotation/session logic lives in `routers/auth.py`. Known gap flagged in root anti-patterns.
- `lastfm.py` is synchronous `pylast`. Callers use `asyncio.to_thread` (routers) or `run_in_executor` (runner) — never call it directly from async code.
- `rate_limit.py` is the only in-process state in the project. No external cache backs it.
