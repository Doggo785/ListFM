# ListFM Knowledge Base

> Cap produit validé (2026-09-09) : voir `VISION.md` en priorité puis `ROADMAP.md` (P0/P1/P2). Machine à playlists auto Last.fm (automations → playlists → historique). Social et export Spotify/YouTube explicitement hors-scope pour l'instant. Fonctionnel d'abord, beau après. Single-VPS, Last.fm-only à vie.
>
> Barre qualité : lire `CONSTRAINTS.md` avant d'écrire du code. Ne jamais l'affaiblir pour faire passer un changement.

## Overview

Full-stack Last.fm playlist automation: FastAPI + React 19 + PostgreSQL. Syncs listening history, generates playlists from top/recent/loved tracks with filter rules.

## Structure

```
ListFM/
├── backend/             # FastAPI (Python) — routers, services, repos, models
│   ├── config.py        # pydantic-settings, .env loading
│   ├── database.py      # async engine + session factory
│   ├── schemas.py       # 33 classes (350 lines)
│   ├── main.py          # App init, CORS, router registration
│   ├── alembic/         # Async migrations (8 revisions)
│   ├── models/          # 14 SQLAlchemy ORM models (+ __init__)
│   ├── routers/         # 5 routers + deps
│   ├── services/        # JWT auth, lastfm wrapper, rate limit
│   ├── repositories/    # 9 data access files (+ __init__)
│   └── tests/           # 22 test files (auth, config, preview, filters, lastfm)
├── frontend/
│   └── src/             # React 19 + Vite 8 (JSX, not TS)
│       ├── main.jsx     # Entry: BrowserRouter + AuthProvider
│       ├── App.jsx      # Routes + AnimatePresence page transitions
│       ├── views/       # 9 page-level components
│       ├── components/  # 21 files (3 subdirs: builder/elements/ui)
│       ├── lib/         # 9 utility modules (+ 1 vitest file)
│       └── contexts/    # AuthContext (the only context)
└── AGENTS.md hierarchy:
    ├── ./AGENTS.md
    ├── backend/AGENTS.md
    │   ├── backend/services/AGENTS.md
    │   ├── backend/routers/AGENTS.md
    │   ├── backend/models/AGENTS.md
    │   └── backend/repositories/AGENTS.md
    └── frontend/src/AGENTS.md
        ├── frontend/src/views/AGENTS.md
        ├── frontend/src/components/AGENTS.md
        └── frontend/src/lib/AGENTS.md
```

## Where to Look

| Task | Location |
|------|----------|
| Auth flows | `backend/routers/auth.py` + `backend/routers/deps.py` |
| Last.fm API calls | `backend/services/lastfm.py` |
| ORM schema | `backend/models/` (14 models) |
| DB queries | `backend/repositories/` (9 repos) |
| Pydantic schemas | `backend/schemas.py` (350 lines) |
| API client | `frontend/src/lib/api.js` (auto-refresh JWT) |
| Auth context | `frontend/src/contexts/AuthContext.jsx` |
| Playlist builder | `frontend/src/views/PlaylistDetail.jsx` (863 lines) |
| Filter UI | `frontend/src/components/builder/FilterBuilder.jsx` |
| App setup (config, DB, Alembic) | `backend/AGENTS.md` |
| Frontend routing & entry | `frontend/src/AGENTS.md` |
| Design system (21 files) | `frontend/src/components/AGENTS.md` |
| Utilities (API client, filter engine, etc.) | `frontend/src/lib/AGENTS.md` |
| Tests | `backend/tests/` (auth, config, preview, filters, lastfm) |

## Conventions

- **Backend**: Async Python (FastAPI), double quotes, modern `str \| None` types, 4-space indent
- **Frontend**: JSX (no TypeScript despite TS dep), semicolons, 2-space indent, `@/` path alias
- **DB**: Async SQLAlchemy 2.x + asyncpg, Alembic migrations, soft-delete via `deleted_at`
- **Auth**: JWT access/refresh via httpOnly cookies, refresh token rotation with family-based reuse detection
- **Tests**: `pytest` + `pytest-asyncio`, `asyncio_mode=auto`, `httpx.AsyncClient` with `ASGITransport`, `try/finally` cleanup, `unittest.mock.patch`
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite` plugin, `cn()` utility (clsx + tailwind-merge), CVA
- **Lint**: ESLint 9 flat config (`npm run check:fast` = 0 erreur 0 warning), Ruff 0.16.8 pin (`ruff check backend`), mypy strict (`mypy backend --ignore-missing-imports`, pin 2.3.1)
- **CI**: 7 jobs (backend-tests w/ PostgreSQL 16 + diff-cover ≥80%, ruff, mypy, gitleaks, osv-scanner, frontend-build, frontend-tests w/ vitest + diff-cover ≥80%) ; voir `CONSTRAINTS.md` (barre qualité, mode Block)

## Anti-Patterns (This Project)

- **Business logic in routers**: `backend/routers/auth.py` (238 lines) handles token rotation/session logic that belongs in services
- **Repository pattern breached**: Routers use raw `select()` queries instead of repository calls
- **Filter engine duplicated**: client copy (`frontend/src/lib/filter-engine.js`) for instant preview + server port (`backend/services/filter_engine.py`) for preview/sweep — keep both in sync when adding ops
- **`filter_groups` partly untyped**: `AutomationCreate/Update/Read` use typed `FilterGroups`, but history snapshots (`AutomationHistoryRead`, `GeneratedPlaylistRead`) still use `list[dict]`
- **Schema-DB mismatch**: Automation `source.type/period` stored as flat DB columns, reconstructed by `model_validator`
- **Compat-only response body**: `TokenResponse` body carries no tokens (cookies only) and the frontend ignores it — kept deliberately to shrink XSS surface, not dead code to delete

## Commands

```bash
# Backend
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
pytest backend/tests/ -q   # ~25s — run synchronously, no background wrapper needed

# Frontend
cd frontend && npm run dev   # dev server :5173
npm run build                # production build
npm run lint                 # ESLint check
```

## Notes

- `.env` at project root (loaded by backend `config.py`)
- **DB**: local Docker Postgres (`listfm-db`, port 5433) — see `backend/AGENTS.md` for container lifecycle
- `.env.example` is incomplete (missing OAuth vars)
- README API docs use `{username}` in paths but actual routes resolve username server-side from auth
