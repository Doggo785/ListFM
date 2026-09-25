<div align="center">

![ListFM Banner](.github/assets/ListFM_readme_banner.webp)

Project in active development. No hosted instance yet. Work happens on the `dev` branch. This note goes away at v0.1.0.

Your Last.fm history already knows your taste. ListFM turns it into playlists, automatically.

I built it because I kept replaying the same 30 tracks while years of scrobbles sat unused.

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![CI](https://github.com/Doggo785/ListFM/actions/workflows/ci.yml/badge.svg)](https://github.com/Doggo785/ListFM/actions/workflows/ci.yml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/909947922e244fbc93096cc528ab05d4)](https://app.codacy.com/gh/Doggo785/ListFM/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

[How it works](#how-it-works) | [Features](#features) | [Quickstart](#quickstart) | [Local dev](#local-dev) | [Stack](#stack) | [License](#license)

</div>

<!--
Live demo CTA goes here once a hosted instance exists.
Planned text: "Try it via the hosted instance" + link.
-->

## How it works

1. Link your Last.fm account. Sign up with email and password, or use Google or Discord OAuth when configured.
2. Create an automation. Pick a source (top tracks, recent plays, loved tracks, top artists), a period, filter rules, and a schedule. Leave the schedule empty for manual runs.
3. Let the sweep run it on schedule, or press Run now.
4. Each run writes a generated playlist in the app. Tracks and tags are frozen at generation time, so the list stays as it was.
5. Check run history for dates, counts before and after filtering, duration, and errors. Failed runs retry up to 4 times with backoff. You can also re-run by hand.

## Features

- Automations with full CRUD, preview before save, and recurring schedules.
- Four sources: top tracks, recent plays, loved tracks, top artists.
- Periods from 7 days to 12 months, plus overall.
- Filter rules (filter groups): track limit, period, tags and genres, value caps, exclusions.
- Run history with bounded auto-retry and manual re-run.
- Generated playlists with an openable detail view and frozen snapshots.
- Dashboard with recent tracks and listening stats: unique artists, albums, top artist. The dashboard shows the last 50 recent tracks.
- Auth with email and password plus optional Google and Discord OAuth. JWT access and refresh tokens live in httpOnly cookies, with refresh rotation and revoke-all on login.
- Last.fm responses are cached in the database for 24 hours, so repeat views skip extra API calls.

## Quickstart

Prereqs:

- Node 18+
- Python 3.11+
- Docker (for Postgres)
- A Last.fm API account (free, at https://www.last.fm/api/account/create)

Steps:

```bash
# 1. Clone the repo
git clone https://github.com/Doggo785/ListFM.git
cd ListFM

# 2. Set env vars
cp .env.example .env
# Fill in your Last.fm keys in .env

# 3. Set up the backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 4. Set up the frontend
cd frontend && npm install && cd ..

# 5. Start Postgres on port 5433 (first run creates the container)
docker run -d --name listfm-db -p 5433:5433 \
  -e POSTGRES_USER=listfm -e POSTGRES_PASSWORD=listfm \
  -e POSTGRES_DB=listfm postgres:16
# Later runs: docker start listfm-db

# 6. Run migrations
cd backend && alembic upgrade head && cd ..
```

Local Postgres runs on port 5433. CI uses the standard 5432.

### Env vars

| Variable | Required | Default |
|---|---|---|
| `LASTFM_API_KEY` | Yes | - |
| `LASTFM_API_SECRET` | Yes | - |
| `DATABASE_URL` | Yes | `postgresql+asyncpg://listfm:listfm@localhost:5433/listfm` |
| `JWT_SECRET` | Yes, min 32 chars | - |
| `COOKIE_SECURE` | No, set `true` in production | `false` |
| `ENABLE_SCHEDULER` | No | `false` |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | No | empty (button hidden) |
| `DISCORD_OAUTH_CLIENT_ID` / `DISCORD_OAUTH_CLIENT_SECRET` | No | empty (button hidden) |
| `OAUTH_REDIRECT_BASE` | No | `http://localhost:8000` |
| `FRONTEND_URL` | No | `http://localhost:5173` |

Google and Discord OAuth are optional. The login buttons only show when the matching client ID and secret are set.

## Local dev

From the repo root, open two terminals:

```bash
# Terminal 1, backend
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

```bash
# Terminal 2, frontend
cd frontend
npm run dev
```

Backend: http://localhost:8000. Frontend: http://localhost:5173. Interactive OpenAPI docs served by FastAPI at http://localhost:8000/docs (Swagger UI). The API resolves the user from the auth JWT, so there is no `{username}` path prefix; endpoints that read Last.fm data need a linked Last.fm account.

```bash
# Backend tests
pytest backend/tests/ -q

# Frontend lint (from frontend/)
npm run lint
```

## Stack

Backend: Python 3.11+, FastAPI, Pydantic v2, PostgreSQL with asyncpg, Alembic for migrations. Frontend: React 19, Vite 8, Tailwind CSS 4, Radix UI, ESLint. CI runs on GitHub Actions (backend tests plus frontend build).

## License

MIT. See [LICENSE](./LICENSE).
