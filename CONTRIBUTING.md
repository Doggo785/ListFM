# Contributing to ListFM

This guide covers setup, workflow, and code style. Follow it for every change. There is no deployment yet, so local checks carry full weight.

## Setup

You need Python 3.14, Node 22.22+ or 24.15+, and Docker. Postgres runs in Docker in a container named listfm-db on port 5433.

Create the backend venv from the repo root:

```
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
```

`.env` stays at the repo root, see `.env.example`. Activate `.venv` first (`source .venv/bin/activate`): `alembic` and `uvicorn` installed elsewhere fail with `No module named 'config'`. Run migrations before first start:

```
alembic -c backend/alembic.ini upgrade head
```

Run the backend with:

```
uvicorn backend.main:app --reload --port 8000
```

Run the frontend with:

```
cd frontend && npm run dev
```

It serves on :5173.

## Quality gates

Run every CI job locally before you push. Start the `listfm-db` container first:

```
scripts/ci-local.sh
```

It prints one OK or FAIL line per job. Pass job names to run a subset, for example `scripts/ci-local.sh ruff mypy`.

Ruff config lives in `ruff.toml`, zero findings required.

## Branch workflow

`main` is the only long-lived branch. Open every PR against `main`; release-please cuts versions from it.

Direct pushes to `main` are blocked, branch protection applies to admins too. Merges are squashed and the branch is deleted on merge.

CI must pass before merge. Every job in `.github/workflows/ci.yml` is a required check.

The PR title doubles as the commit message. Use `type(scope): summary`, lowercase imperative. Types in use are feat, fix, chore, docs, ci, refactor, style, and test.

## Backend conventions

The backend is FastAPI with async Python. Use double quotes and 4-space indent, and type optional values as `str | None`.

Data access uses async SQLAlchemy 2.x with asyncpg. Ship schema changes as Alembic revisions.

Rows are soft-deleted through `deleted_at`. The caller owns the transaction and commits.

Catch DB failures as `except SQLAlchemyError` with a rollback. Never wrap a commit in a blind `except Exception`.

Keep layers strict. `routers/` handles HTTP only, `services/` holds business logic, and `repositories/` holds queries. Business logic in routers is a bug.

Pydantic request and response models live in `backend/schemas.py`. JWT access and refresh tokens travel in httpOnly cookies.

## Frontend conventions

The frontend uses React 19 with Vite and plain JSX, with no TypeScript. Code uses semicolons and 2-space indent, with imports resolved through the `@/` path alias.

Styling is Tailwind CSS 4, merge classes with the `cn()` helper.

`frontend/src/lib/api.js` is the single API client and it refreshes the JWT automatically. Do not add a second client. Lint uses ESLint 9 flat config, check with `npm run lint`.

## Testing

Backend tests use pytest with pytest-asyncio. They call the ASGI app through httpx AsyncClient.

Mock outside calls with unittest.mock.patch. Clean DB fixtures in try/finally so state never leaks between cases.

Frontend tests use vitest, run them with `npm test` in `frontend/`.

PRs need green CI. No reviewer approval is required.
