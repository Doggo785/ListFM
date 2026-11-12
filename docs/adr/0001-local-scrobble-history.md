# The full listening history is stored locally

Sources used to read Last.fm live, capped at 50 tracks: a selective filter saw too few tracks, the preview couldn't reflect the run, and every deeper read cost more calls. Every person's listens are now stored in the database: a full load when Last.fm is first linked (`user.getRecentTracks` in pages of 1000, falling back to 200, a method taken from felhag/lastfm-stats-web), then an incremental sync (only what is newer than the last known listen) before each run and each preview. Sources become database queries, with no Last.fm call.

## Considered Options

- **Live reads with an adjustable depth**: cost per run grows with the depth, and the preview drifts from the run as soon as the two read differently.
- **Live reads until the playlist is full**: unpredictable cost from one run to the next.

## Consequences

- Space measured on Postgres 16 (1 M rows inserted in chronological order, key `(user_id, played_at, track_id)`): about 220 bytes per listen with the project's `varchar(36)` ids (120 with native `uuid`). 150,000 listens ≈ 33 MB, 5 M ≈ 1.1 GB, plus the distinct tracks in `tracks`.
- Pages of 1000 exceed Last.fm's documented maximum (200): the fallback to 200 is mandatory.
- The first load takes several minutes for a large account and must show its progress.
- Since the newcomer's guide (2026-11), the first load reads from newest to oldest: the recent months a playlist asks for are there in seconds, and the preview says how far back the history has been read. A run asked for during that load waits on its line and starts by itself at the end, instead of failing.
- The Last.fm API terms (§4.3.4) cap stored Last.fm data at 100 MB ("Reasonable Usage Cap"). The owner's dev database, with their history alone, already held about 209 MB in November 2026. Owner's decision (2026-11-12): keep the full history without asking Last.fm, since few people will use the site; if usage grows, the owner adapts the method (for instance by limiting the years kept). Don't reopen the question without them.
