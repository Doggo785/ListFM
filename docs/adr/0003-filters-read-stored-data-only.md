# Filters only read the database; a tag catalogue fills up separately

Filtering on a tag called Last.fm track by track during the run or the preview: up to 3000 calls and 12 minutes for a single filter, which makes a live preview impossible. Filters and the pipeline no longer make any Last.fm call and only read the database. A background task fills a catalogue of tags per artist, most played artists first: one call covers all of an artist's tracks, and the catalogue is shared between people.

## Considered Options

- **One call per track, with a cache**: 26,968 calls for an account of 153,000 listens, against 9,561 per artist.
- **Look up on click with an estimate of the calls** (the preview's initial decision): even at one call per artist, 12 minutes for a 3-month window.

## Consequences

- Data never looked up passes no filter, not even "does not contain": unknown is not "no tag". Until the catalogue is full, a playlist filtered on a tag may come out incomplete, and only the share of known tags says so.
- Tags are valid for 90 days: reading every artist again each week would keep the task running nonstop. A pass refreshes at most 300 expired artists, so a catalogue filled in one go doesn't expire in one go, and only a pass looking up artists with no tags yet makes runs wait: expired tags stay usable while they are refreshed.
- Only artist tags are offered: an artist who changes style between two albums is misfiled until album tags arrive (the sync already keeps each track's album).
- Listener and global popularity filters are removed: they need one call per track, about 2 h for an account of 150,000 listens, with nothing shared between artists.
