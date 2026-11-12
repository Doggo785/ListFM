# ListFM

A machine that makes playlists automatically from Last.fm: FastAPI + async SQLAlchemy + Postgres, React 19 + Vite in JSX.

Read before acting:
- `VISION.md`: the direction and the non-goals. A feature outside them is asked of the owner.
- `ROADMAP.md`: the status, and the only list of what comes next.
- `CONSTRAINTS.md` before writing code: the quality bar, the checks, the merge rule.
- `CONTRIBUTING.md`: setup, branch workflow, code conventions.
- `GLOSSARY.md`: the domain vocabulary; `docs/adr/`: the structural decisions and their why.

## Working with the owner

- Speak French with the owner. Explain a technical point with a one-sentence everyday picture.
- As few PRs as possible: group changes that can go together and limit pushes, since every CI run and every merge costs time. Atomic Conventional Commits inside the PR.
- Everything that lands on GitHub is in English: code, comments, docs, commits, PRs, console lines. Commit and PR titles `type(scope): summary`, PR body `Summary` / `Changes` / `Test plan` like the merged PRs. No session link or attribution line.
- `scripts/ci-local.sh` passes green before every push, even for a docs PR.
- Merge only on "go merge #N" naming the PR (details in `CONSTRAINTS.md`).
- Follow a PR's GitHub Actions jobs and `Codacy Static Code Analysis`: wait for it, and look at its alerts and duplications (`newIssues` and `deltaClonesCount`) before calling a PR ready. An alert is fixed or shown to the owner, never silently ignored.

## Backend pitfalls

- `services/lastfm.py` is synchronous `pylast`: call it through `asyncio.to_thread` (routers) or `run_in_executor` (runner), never directly from async code.
- The console goes through `services/activity_log.py`: one readable line per step. Never a Last.fm URL or an exception message in it: an httpx error carries the URL, and so the API key (#86).
- The sync's Last.fm calls go through `_throttled_call` (pace `LASTFM_MIN_INTERVAL`, backs off on error 29). Tests patch the interval to 0.
- The filter engine only exists server side (`services/filter_engine.py`): the screen shows the preview's answer without reworking it. A condition without a value and an empty group are ignored.
- `filter_groups` is validated when read from the database: removing a field or an operator needs a migration that rewrites stored automations.
- The pipeline and filters make no Last.fm call (ADR 0003): they read the listens and the tag catalogue in the database. A field never looked up stays missing from the track and passes no filter, not even `not_contains`.
- Repositories don't commit: the caller commits, and catches `SQLAlchemyError` with a rollback.
- Soft delete through `deleted_at` on `User`, `Automation`, `GeneratedPlaylist`: every query filters `deleted_at IS NULL`. Deleting an account, though, really erases everything it holds (`erase_user_automations`, `delete_user`): only an empty `users` row remains.
- Models declare no `relationship()`; joins are explicit `select().join()`.
- `Automation.output` is stored flat (`output_max_size`) and rebuilt by a `model_validator`.
- Provider tokens: no plaintext column. Add them back only encrypted at rest.
- Last.fm is linked through its web authorization: the return token is used once, the session key is not kept. A test links an account with `link_lastfm` from `tests/conftest.py`.
- Stored listens always form one block, so that an interrupted sync resumes where it stopped: what is newer than the latest listen is read from oldest to newest, and a first import reads the rest from newest to oldest, from before the oldest one. In that direction a page never replaces a track's album (`store_track_albums(older=True)`).
- The sync and the tag pass report progress through `progress_store`: `since` (start of the history, given before the first page) and `reached` (how far back the import has read), and `eta_seconds()` (at the measured pace). On the Dashboard an import's front starts from the right (today) and only moves back. `BackgroundTasks` puts it on `ribbonStage.work`, which the ribbon glides between two reads (`lib/backgroundWork.js`). The drawn front (`shown`) carries over from one read to the next and only moves forward; on the Dashboard the head goes through `moveHead`, and what leaves the flame starts from `waveCentre`, a JS copy of the shader's computation: changing one means changing the other.
- A run that can't start (first import in progress, or a tag pass in progress for a run that filters by tags, see `_check_ready`) waits on its history line (`waiting`), without counting an attempt. Any new start of the automation takes that line over. It starts again at the end of the import or the tag pass (`after_sync`, `after_pass`), and on every sweep (after a restart, nothing else would start it).
- Every run, manual or scheduled, goes through `run_automation` and registers in `_in_flight` (process memory, one worker) with a progress ticket: `GET /api/scrobbles/sync` lists them with `next_run_at`. A finished run stays there `RUN_LINGER_SECONDS`, and the front sends `RUNS_DONE` on `window` when it sees one leave: pages that show runs or playlists read again.
- During a first import (`scrobbles_complete_at` empty), the Dashboard looks up no cover: its albums change on every read. The lookup starts on the final albums.
- An empty `users.timezone` means "not known yet", read as UTC: the browser only fills it in that case, so it never overwrites a choice made in Settings.
- `POST /api/public/listener` (scene 7 of the landing page) needs no account and spends the syncs' Last.fm budget: limited per visitor and for the whole site, kept 1 h in memory only. A POST so the username stays out of access logs; it is written neither to the database nor to the console.
- `users.guide_done_at`: the newcomer's guide was finished or skipped. It then never starts by itself again, on any device; "Replay the guide" in Settings restarts it without touching the column.
- `TokenResponse` has an empty body on purpose (tokens in httpOnly cookies only): it is not dead code.
- A cron is always read through `schemas.cron_trigger`, never `CronTrigger.from_crontab`: APScheduler counts days from Monday, so `1` would fall on a Tuesday.
- The sweep's scheduler only starts with `ENABLE_SCHEDULER`; the rate limiter lives in process memory. The app assumes a single worker.
- A visitor's IP comes from `TRUSTED_IP_HEADER` (`CF-Connecting-IP` behind Cloudflare; `X-Real-IP` by default in `compose.yaml`, which the bundled nginx overwrites), otherwise from the socket: never `X-Forwarded-For`, which a visitor writes themselves. Login checks `failed_login_limiter` (per account) before the password, otherwise a 200 answer would give away a right guess.
- Signing up opens no session: `/register` mails a link (`mail_links`, only the hash is kept, it works once) and the session opens by following it (`/confirm`). A login on an address never confirmed answers 403. An unconfirmed sign-up doesn't own its address: a new sign-up or a verified Google/Discord login takes it over (`release_unconfirmed_email`), and the hourly purge erases it after 7 days. Link requests answer the same whether the address exists or not.
- `services/mailer.py` sends over SMTP (SSL). Without `SMTP_HOST` it prints the mail locally (to follow its links) and refuses in production (`COOKIE_SECURE`): a link opens an account. Tests never go through it: `SENT_MAILS` and `mailed_token` in `conftest.py`.
- Home-server guard rails: `MAX_AUTOMATIONS` (20), a schedule at most once a day (fixed minute and hour, `_validate_cron` and `isValidCron` judge the cases in `frontend/src/lib/cron-cases.json`), Run now and Re-run limited by `manual_run_limiter` right before the run (a refused call doesn't count), and `PLAYLISTS_KEPT` (50) playlists per automation, which `noRepeatPlaylists` can't exceed.

## Frontend pitfalls

- JSX without TypeScript despite the TS dependency; imports through the `@/` alias.
- `src/lib/api.js` is the only HTTP client (automatic JWT refresh). No second client. Every call gives up after 30 s; the preview, Run now and Re-run get 10 min (they report progress on a ticket).
- Colours, type and motion come from the tokens in `src/index.css`, no hard-coded value in a new screen. The direction is in `PRODUCT.md`.
- Pixel fonts: Tiny5 for titles and numbers, Jersey 20 for text, with no `letter-spacing` and no size outside the `--text-*` scale, or the letters blur. No weight exists: hierarchy comes from size and colour.
- The pixel ribbon (`lib/pixelRibbon.js`) mounts once in `App` and has no reason to be remounted. Every content block carries `data-quiet` (12 at most on screen): the ribbon dissolves around it and never runs under text, except the Dashboard's forged name. A page carrying `data-ribbon-hot` heats it (a failing generation). An empty `data-chain="412,120,50"` element lays it straight in that band, with one width per stage of the chain.
- The Dashboard drives the ribbon through `ribbonStage` and hands it back when leaving: it is the only screen that sets a track on it. Its cards live in `#under-ribbon`, under the canvas, mounted through a portal, as direct children: the layer's perspective only reaches those.
- The landing page has its own canvas (`lib/landing/stage.js`) and the shader goes quiet under it (`silent` in its scene): the only exception to the single ribbon, because the thread must be able to come apart into pixels. The show follows the scroll with a slight smoothed delay, and when scrolling stops the page glides to the next beat in the direction of the gesture (`storyBeats`, `beatToSettle`), backwards too. No CSS `scroll-snap`: it stutters with trackpads.
- `lib/landing/demo.json` comes out of `scripts/landing_demo.py`, through the real engine, and is public for good once committed: the owner reviews it first. Don't edit it by hand.
- The newcomer's guide (`components/elements/Guide.jsx`, steps in `lib/guide.js`) points at the real screens through `data-guide-step` and existing classes (`.background-task`, `.poster__line`): renaming one means changing the step. During its steps the editor shows its fields empty (the draft keeps its defaults underneath) and hides the recipes. The mascot is called "the thread" everywhere, as on the landing page; on the Dashboard it burns as a flame.
- An artist, album or track shown opens its Last.fm page (`LastfmLink`, `lastfmUrl`), and a page showing Last.fm data carries `LastfmCredit`: the API terms require it (§2.7).
- `views/Privacy.jsx` describes what the site keeps and who it talks to: a new stored datum, cookie, third-party service or log must be added there in the same PR, or the page lies. It also promises that no IP is kept (no access log on disk in production).
- `DESIGN.md` describes the visual world, written from the finished site.

## Deployment

`compose.yaml` at the root: `backend/Dockerfile` (migrates then runs uvicorn, one worker, `--no-access-log`) and `frontend/Dockerfile` (Vite build served by nginx, `frontend/nginx.conf`, which proxies `/api`). A new env variable goes into `compose.yaml`, `.env.example` and the README's table.

## Local database

Postgres in Docker, container `listfm-db` on port **5433**, databases `listfm` (dev) and `listfm_test` (tests). After a reboot: `docker start listfm-db`. After a new migration, migrate the test database too: `DATABASE_URL=postgresql+asyncpg://listfm:listfm@localhost:5433/listfm_test alembic upgrade head` (from `backend/`); `ci-local.sh` doesn't. A connection error in tests comes first from a stopped container.
