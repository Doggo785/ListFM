# ListFM — Roadmap

The only place where status is written. Direction is in `VISION.md`, the quality bar in `CONSTRAINTS.md`.
In order, grouping items into one PR whenever possible. Anything not listed here waits for the owner's go-ahead.

## Versions

- release-please on `main`. We stay in **0.x.x** until the first clean release, **v1.0.0**.
- `feat` → 0.(x+1).0, `fix` → 0.x.(y+1). `bump-minor-pre-major: true` keeps a breaking commit (`feat!`) in 0.x.
- v1.0.0 comes from a `Release-As: 1.0.0` commit, only once the "Before v1.0.0" section is empty and the owner says so.
- When to publish: the release PR is merged per coherent batch (a ROADMAP block finished and tested for real), at once if it carries a security fix. The agent may merge it alone when its checks are green, its changelog right and the change tested for real.

## Done

- **Product core** (automations → generated playlists → history): a failed run no longer loops (#82), linking another Last.fm account moves the automations and clears the personal cache (#90), cron read in the person's time zone, sent by their browser (#92), the Dashboard's recent plays always read live (the database is the fallback when Last.fm is down) (#93), two tabs refreshing the session at once no longer sign out (30 s grace after rotation) (#94), internal errors hidden in the UI (#95), an expired session goes back to login (#96), no more global counter taken for your plays in the top artists source (#97), dead code removed (#98, #99), OAuth attached to a local account only when both emails are verified (#87), broken flows and blocking security issues (#13–#26), a runner that produces playlists and a readable history (#20, #27), bounded retries that keep the original `scheduled_for` (#30), sweep committing per automation, DB pool and DB errors as JSON (#39), the Dashboard's recent plays labelled "partial preview" (#41).
- **Last.fm speed**: enrichment skipped when the filters don't need it (#42), live progress and a real cancel (#43), batches of 200 at a 0.25 s pace with a fallback on error 29 (#45), cache freshness per data group (#46, #47), a failed call is no longer cached (#83), one `track.getInfo` per track (#88), artist and album tags reused between tracks for 7 days (#102), profile in one call per load instead of 4 (#103).
- **Repo hygiene**: ruff, mypy, gitleaks, osv-scanner and diff-cover blocking in CI, Dependabot, `scripts/ci-local.sh` (#34–#63), docs rewritten (#66), dead routes removed (#67), `main` as the only branch (#69), release-please and v0.1.0 (#80), API key kept out of the logs (#86), local CI in parallel and backend tests 3× faster (#85).

## Before v1.0.0

Rule: identity first, screens after. A bug found goes into a `fix` PR at once (immediate release if it is a security fix); a new idea goes to "Later".

### Phase A: foundations (no visuals)

1. *(done, #106)* **Docs**: `GLOSSARY.md`, ADR 0001 and 0002, this ROADMAP.
2. *(done, #107)* **Listen sync** (ADR 0001): a listens table, full then incremental sync (`user.getRecentTracks` in pages of 1000, falling back to 200), progress, the loved list read in full. Always before a run, at most every 10 min for the preview. During the first load the preview is partial and runs wait for the end.
3. *(done, #109, #111, #112, #113)* **Chain engine** (ADR 0002): one source, the listens, then Window → Filters → Sort → Limits.
   - Window counted from the run's planned date: sliding, shifted ("the same month a year ago"), all listens. No fixed dates.
   - Filters: the existing ones (without listeners, global popularity or Rank; operators at least, at most, exactly, between) + first listen, artist in your top N (computed on the window by default, or on the whole history, a relative period, fixed dates), time of listening (from one day to another, from one hour to another, past midnight allowed, at least X listens, the person's time zone; the sort counts either every listen of the window or only those of that time). AND/OR groups two levels deep at most, the same check front and back. One `filterGroups` contract (camelCase everywhere).
   - Sorts: most played, most recently played, most recently discovered, random (weightable by plays). The sort picks the kept tracks and sets their order.
   - Limits: size, maximum per artist, maximum per album, a reissue (Bonus, Deluxe, Remaster…) counting as the original album (the sync keeps each track's album, the history is read again once), no repeats over the automation's last N playlists.
   - Fewer tracks than the size: a shorter playlist, history "32/50". Zero: an empty run.
   - Existing automations, playlists and history wiped (they were tests), no migration.
4. *(done)* **Tag catalogue** (ADR 0003): a background task after the sync, one call per artist, most played first, shared between people, valid 90 days. Album tags later.
5. *(done)* **Server preview**: what the run would produce now, with the count of each stage and the share of known tags. No Last.fm call. The screen shows that answer as is and says when the settings changed since. The API also exposes the progress of background tasks (listens, tags).
6. *(done)* **Honest retry**: a real retry route that keeps the original `scheduled_for`, so the same window.
7. *(done)* **Readable logs**: one line per sync page, every 100 artists, per run, preview and Last.fm call, without the API key.
8. *(done)* Small independent PRs: weekly security scan, timeout and abort in `frontend/src/lib/api.js`, a strict `isValidCron` identical front and back, cascading soft delete, role removed.

### Phase B: visual identity with [Impeccable](https://github.com/pbakaus/impeccable)

Goal: one art direction across the site, animated everywhere, with a style that evolves from page to page. Chosen by the owner on a prototype (2026-11-04): **pixel, Braise palette, dark only**. A dithered pixel ribbon travels across every page, guides the eye and changes shape and heat with the page, while staying secondary. Changing page is immediate: only the ribbon travels, nothing covers the screen. The front was rebuilt from scratch; the API and `lib/api.js` stayed.

1. *(done)* `impeccable init` → `PRODUCT.md`, direction validated.
2. *(done)* **Base**: tokens (colours, type, motion) in one place, the pixel ribbon, a top navigation instead of the sidebar, immediate page changes.
3. *(done)* **Base components** on those tokens: Button, Select, an accessible modal (role, focus, Escape), OAuth SVGs.
4. *(done)* **Background task tracking**: a discreet indicator on every page that stays while a task can change results and stays silent for small routine syncs.
5. *(done)* **Blocking detector**: `npm run check:design` in `scripts/ci-local.sh` and in CI (job `frontend-build`).

Guard rail: Impeccable's `live` mode only with `IMPECCABLE_LIVE_COPY_AGENT=chat` (otherwise it starts an agent without permissions).

### Phase C: screens rebuilt

Each PR wires the ribbon to the screen's real data and deletes the old code it replaces.

1. *(done)* **Creator**: near-infinite freedom in a careful, intuitive UI that is never crowded (advanced settings folded by default). One page, settings and live preview side by side (rerun ~0.4 s after each change), each stage with its counter, filters and schedule folded under "Refine" and "Schedule". A name suggested from the settings, editable. 7 presets: Top tracks, Recent, Loved, Top artists, Month's discoveries, Rediscoveries, Seasonal. Filters read as a sentence, groups folded under "Advanced". The ribbon draws the chain's counters.
2. *(done)* **Creator finish**. Tiny5 kept for numbers after a comparison with Jersey 20. Rejected: an editable "or" between groups (the engine ORs groups by construction, an AND is written inside one group) and the ribbon tapering with the stages.
3. *(done)* **Playlists**: menu Dashboard, Automations, Playlists. Playlists sit on one shelf per automation, each with a cover (two albums cut apart by the ribbon) and the period it covers. One opens full screen, its cover, name and period gliding from the shelf, with a copy of the list, a link to the automation and deletion.
4. *(done)* **History**: part of the automation's page rather than a tab. Each automation card says how its last generation went; the automation's page shows its history by day, one line per generation, attempts folded, with "Retrying at 14:32", final failure, empty run and "32/50". Re-run goes through the retry route, on the last failed generation only. The ribbon heats up while a last generation is failing.
5. *(done)* **Dashboard**: a poster, then the year in flight. The name of the moment's artist, giant, catches fire from the ribbon's playhead (the forge), over the ribbon's width following listens day by day, embers rising from it, the moment's albums, the last runs and totals. Further down, scrolling rewinds the year on a 3D arc of covers, the same arc showing the automations. Only album covers are used, Last.fm's artist images being gone.
6. *(done)* **Send to apps**: on a playlist's page, a button copies the list, explains the steps in a modal and opens Tune My Music, and another downloads the cover (384 px). Direct export stays blocked by the platforms, see "Later".
7. *(done)* **Sign-in and Settings**: "ListFM" in giant letters on the ribbon with the form beside it, on every screen before the site. Settings: time zone, Last.fm account, password (other devices are signed out), account deletion (listens and Last.fm link really erased, the email freed). Last.fm is linked through its official authorization, and only the username is kept.
8. *(done)* **Landing page**: chosen on a prototype among three variants ("The forge"). It is the machine, told on scroll by a living thread, on a real listening history frozen in `lib/landing/demo.json`: it wakes up, listens, works (Window, Filters, Sort, Limit, one square per track of a real month), delivers a cover, carries on alone, follows other recipes, then turns to the visitor, whose Last.fm username is enough to forge the name of their artist, without an account (`POST /api/public/listener`, 2 Last.fm calls, rate limited, nothing stored).
9. *(done)* ESLint rule `react-hooks/set-state-in-effect` turned back on.

### Phase D: finish

*(done)* **Interactive guide for newcomers**: a bubble beside what it shows, an ember frame, nothing dimmed. It starts by itself after the Last.fm link and keeps company during the first import: 12 steps, from the status and the thread (a flame on the Dashboard) to the editor, field by field, then the first automation's page and a welcome. It can be skipped (button or Escape), waits with "Resume guide" when the person leaves its path, restarts from Settings, and "finished or skipped" is kept on the account. So that it helps during the import, the first import reads from newest to oldest, and a run asked for during the import, or during the tag pass when it filters by tags, waits on its line and starts by itself instead of failing.

*(done)* **A new account's first import**: followed end to end on a fake Last.fm, then on a real account reset to zero. Found and fixed: the tag pass waited ~3 min before its first artist, the Dashboard looked up a cover on every read during the import, and "Your year" stayed on the automations when its months arrived after opening.

*(done)* **The thread at work in the app**: the top line says how far the import has read, its share and the time left; the ribbon carries a hot front gliding between two reads, and on the Dashboard the flame shows the history read so far. Runs too, scheduled ones included, while the app is open: the status lists runs in progress and the next one's time, and a finished run stays listed 5 s so a one-second run is seen. Its end makes open pages read runs and playlists again.

*(done)* **Privacy page and legal notice**: `/privacy`, written from the real inventory of the code rather than copied from a template, with the legal notice at the bottom. Linked from the landing page, sign-up and Settings. So that it tells the truth: deleting an account also erases its automations, runs and playlists, and sessions no longer keep the IP or the browser. The server runs without an access log on disk (`--no-access-log`), as the page promises.

**Plan to v1.0.0** (end of phase D review, 2026-11-12). ListFM runs on the owner's own server, behind Cloudflare.

1. *(done, #156 and #164)* Dependabot updates checked in batches.
2. *(done)* **Harden**:
   - the limiter no longer trusts `X-Forwarded-For`, only the proxy's header (`TRUSTED_IP_HEADER`), and locks an account after 20 wrong passwords in an hour, whatever the IP;
   - guard rails: 20 automations per account, a schedule at most once a day (a minute and an hour, the same rule front and server, shared cases in `cron-cases.json`), Run now and Re-run once a minute, 50 playlists kept per automation;
   - "Powered by AudioScrobbler" credit and artist, album and track names linked to Last.fm (API terms, §2.7);
   - Privacy page updated, 404 page, an abort delay in `api.js`, `/docs` off, `/api/health` querying the database, `PUT` in CORS, `role` and `source_tracks` removed, the ribbon rebuilt after a lost WebGL context, CI on Python 3.14 and run weekly.
3. *(done)* **Mail**: email verification before the account can be used (an account never verified is erased after 7 days) and forgotten password (a one-hour, single-use link that signs out everywhere, the same answer whether the email exists or not), over SMTP.
4. *(done)* **Deploy + README**: `compose.yaml` (Postgres, an API that migrates at start without an access log, nginx serving the site and `/api` without an access log, Docker logs capped at 3 × 10 MB), README rebuilt in the art direction with the self-hosting guide. To check at the private deploy: a preview or run longer than 100 s would be cut by Cloudflare (error 524).
5. *(done)* Real-hardware measures (ribbon load on a small PC and a phone, a real first import, the 3D deck during an import, the full journey on a phone), compact phone menu, `impeccable polish` and `harden`, remaining animations, `DESIGN.md` rewritten from the finished site, session rule (signing in signs out other devices).
6. *(done)* Server side: mail domain (SPF, DKIM, DMARC), backups with an encrypted offsite copy, monitoring, Google and Discord redirect URIs, secrets.
7. *(done, 2026-11-12)* A private deploy, a full test, then the public address (https://listfm.doggolabs.fr) and `Release-As: 1.0.0`. The production database started empty.

## Later (owner's go-ahead required)

Accounts: sign in with Last.fm, change email, link or unlink Google and Discord from Settings.

Direct export to Spotify/YouTube/Apple (blocked by their rules: 5 hand-added users at Spotify, 100 searches a day for the whole site at YouTube, 99 USD a year at Apple; noted 2026-11-06, to check again), social and sharing, shared presets, discovery (tracks never listened to), listener and global popularity filters (one call per track), then the preview image when the link is shared.

**Names that update themselves** (owner's idea, useful mostly once playlists are sent to streaming apps): an automation's name can hold variables resolved at each run, for example `Seasonal {season} {year}` gives "Seasonal Winter 2026". To decide: the list of variables, the hemisphere for seasons, and the year of a winter spanning two years.

## Last.fm lessons

- No public quota, the docs ask to be reasonable: every change aims at **fewer calls**, not faster calls.
- A filter never applies to data that was never looked up.
- Keep warming the cache for repeated runs, even if a single run loses from it: the partial version without write-back in #42 cost more over 30 days. Measure before and after.
