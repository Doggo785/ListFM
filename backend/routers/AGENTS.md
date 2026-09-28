# Backend/routers — Route Handlers

## Overview

FastAPI route handlers organized by domain: auth (cookie-based JWT), OAuth, user data proxy, automation CRUD, and playlist management.

## Where to Look

| File | Contents | LOC |
|------|----------|-----|
| `deps.py` | `get_current_user()` (reads access_token cookie), `get_current_active_user()` (soft-delete check), `get_current_user_lastfm_username()`, `get_owned_automation()` (ownership guard), `set_auth_cookies()` / `clear_auth_cookies()` | 111 |
| `auth.py` | `/api/auth/register, login, refresh, logout, me` — token rotation logic, imports hashing/storage helpers from `services/auth.py` + `repositories/refresh_tokens.py` | 238 |
| `auth_oauth.py` | Google/Discord OAuth login flows (302 redirect with state CSRF), `POST /api/auth/link-lastfm` (account linking), `POST /api/auth/oauth/complete-email` | 430 |
| `users.py` | Last.fm data proxy: `/api/info, /recent-tracks, /top-tags, /top-tracks, /loved-tracks, /source-tracks` | 151 |
| `automations.py` | CRUD for automations + `POST /api/automations/preview`; preview takes typed `PreviewRequest`, create takes `AutomationCreate` | 191 |
| `generated_playlists.py` | CRUD for saved generated playlists | 89 |

## Key Patterns

- **Dependency injection chain**: `get_current_user` → `get_current_active_user` → `get_current_user_lastfm_username` — each builds on the prior via `Depends`, forming a composable auth pipeline
- **Cookie auth**: `get_current_user()` reads `access_token` from httpOnly cookie (not Authorization header); `set_auth_cookies()` / `clear_auth_cookies()` centralize cookie lifespan and security flags
- **Manual transactions**: Every write endpoint calls `db.commit()` in try/except with `db.rollback()` on failure — no middleware abstraction exists for this
- **Pydantic validation**: Most endpoints accept request bodies through typed schemas (`UserCreate`, `AutomationCreate`, etc.)
- **Rate limiting at endpoint top**: `rate_limit(request, limiter)` invoked explicitly inside handler functions (not as a FastAPI dependency or middleware)
- **OAuth state cookie CSRF**: Login step sets `oauth_state` httpOnly cookie, callback validates it matches before exchanging code

## Anti-Patterns

- **Manual commit/rollback boilerplate**: 10+ endpoints across 4 files duplicate the same try/except block — a middleware or Depends-based transaction wrapper would eliminate the repetition
- **Untyped preview body**: fixed — `automations.py:preview_automation` takes `PreviewRequest`, create takes `AutomationCreate` (P0 #24). History snapshots (`AutomationHistoryRead`, `GeneratedPlaylistRead`) still use `list[dict]`.
- **Redundant DB round-trips**: Most protected endpoints declare both `get_current_active_user` (fetches User row) and `get_current_user_lastfm_username` (separate query for AuthProvider) when a single dependency returning both would suffice
- **Inline cookie deletion**: `auth_oauth.py` calls `response.delete_cookie()` inline for the OAuth state cookie rather than using a centralized helper, inconsistent with the `clear_auth_cookies()` pattern used elsewhere
