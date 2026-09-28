# backend/ — App Infrastructure

## Overview

FastAPI app bootstrap: config, DB engine, schema models, Alembic migrations, and route mounting. The entry point for understanding how the backend initializes.

## Where to Look

| Concern | File | Lines |
|---------|------|-------|
| App init, CORS, router registration | `main.py` | 90 |
| pydantic-settings env loading | `config.py` | 59 |
| Async engine + session factory + `get_db()` DI | `database.py` | 29 |
| 33 classes request/response models | `schemas.py` | 350 |
| Async Alembic runner, env-var URL | `alembic/env.py` | 71 |
| 8 revisions (initial schema, constraints, unique constraints, lastfm normalization, index) | `alembic/versions/` | — |

## Key Patterns

- **Lifespan**: Modern `@asynccontextmanager` pattern — shutdown only disposes engine. **No startup logic** (no DB health check).
- **Settings**: pydantic-settings `@lru_cache` singleton. JWT secret validated ≥32 chars at startup. `.env` loaded from project root.
- **DB session**: `expire_on_commit=False` — avoids `DetachedInstanceError` but can read stale post-commit.
- **Alembic**: `DATABASE_URL` from env var, not hardcoded. Async migrations via `async_engine_from_config` + `asyncio.run`. Side-effect model import (`import models`) for autogenerate.
- **Exception handler**: `@app.exception_handler(OSError)` returns clean JSON 503 when PostgreSQL is unreachable (instead of HTML 500).
- **Single middleware**: CORS only — no auth, logging, or timing middleware.
- **Routes**: 5 routers registered flat, each defining its own prefix — auth (`/api/auth`), OAuth (`/api/auth`), users (`/api`), automations (`/api`), generated playlists (`/api`).

## Anti-Patterns

- **No global JSON 500 handler** — only `OSError` (DB unreachable) is handled; other unhandled errors still return FastAPI default HTML.
- **No transaction middleware** — 10+ endpoints manually duplicate `try/commit/except/rollback`.
- **No startup DB health check** — app starts even if database is unreachable.
- **Sync `services/lastfm.py` in async routes** — `pylast` calls block the event loop; no `run_in_executor` wrapper.
- **`schemas.py` monolithic** — 276 lines, 29 models. Auth, automations, tracks, albums, playlists all in one file.

## Notes

- **DB access**: Postgres en Docker local, conteneur `listfm-db` sur le port **5433** (5432 reste libre pour d'autres services). Bases : `listfm` (dev) et `listfm_test` (tests). Après un reboot : `docker start listfm-db`; si la connexion échoue, vérifier d'abord que le conteneur tourne. Ne pas modifier le `DATABASE_URL` hors de `localhost:5433`.
