# ListFM

A machine that builds playlists automatically from a person's Last.fm listening history.

## Language

**Automation**:
The recipe that defines how a playlist is generated: a window, filters, a sort, limits and an optional schedule. It is what the Creator makes.
_Avoid_: Playlist, auto playlist, recipe (in code)

**Playlist**:
The frozen result of an automation's run: a list of tracks with their tags as they were at generation time.
_Avoid_: Generated playlist (when the context is clear), automation

**Run**:
One execution of an automation, scheduled or manual, which produces at most one playlist and leaves a line in the history.
_Avoid_: Execution, generation, job

**History**:
The list of an automation's runs: when, how many tracks, and the error when one failed.
_Avoid_: Listening history (say Listens)

**Waiting run**:
A run asked for during the first import, or during the tag pass when it filters by tags: it waits on its history line and starts by itself once ready. It is neither a failure nor an attempt.
_Avoid_: Blocked run, failed run

**Empty run**:
A run that finds no track: it creates no playlist, it is not a failure and it is not retried.
_Avoid_: Failure, error

## Listens

**Listen**:
One play of a track recorded by Last.fm for a person, with its date.
_Avoid_: Scrobble, play

**Listens**:
All of a person's listens, copied from Last.fm. They are an automation's only starting point.
_Avoid_: History, source, scrobbles

**Sync**:
Bringing a person's listens up to date from Last.fm: complete the first time, then only the new ones.
_Avoid_: Fetch, refresh

**Guide**:
The newcomer's walkthrough on the real screens, from the Dashboard to their first automation, during the first import. Once finished or skipped, it only starts again from Settings.
_Avoid_: Tutorial, onboarding, tour

**Tag catalogue**:
The known tags per artist, shared between people and filled in the background. An artist missing from the catalogue has unknown tags, which is not the same as an artist without tags.
_Avoid_: Cache, enrichment

**Thread**:
The ribbon as the landing page and the guide present it: a living presence that listens and works, with no face and no voice. "The thread" in the copy; on the Dashboard it burns as a flame.
_Avoid_: Mascot, line, wave

## An automation's chain

**Window**:
Which listens an automation looks at, counted from the run's planned date, that is the last slot of its schedule even when the run starts late or by hand (a retry keeps the same window; with no schedule, it counts from now): sliding ("the last 30 days"), shifted ("the same month a year ago") or all listens.
_Avoid_: Period, date range, source

**Filter**:
A rule that keeps or drops tracks of the window.
_Avoid_: Condition (except for one line of a filter group), criterion

**Sort**:
The order in which the kept tracks are ranked before they are taken.
_Avoid_: Ranking, order

**Limit**:
A cap applied while taking tracks in sort order: the playlist's size, or a maximum per artist, per album, and so on.
_Avoid_: Constraint, cap

**Preset**:
A prefilled automation (e.g. "Top tracks", "Loved") that a person starts from and changes.
_Avoid_: Source, template

**Preview**:
What the run would produce if it happened now, with the count at each stage of the chain.
_Avoid_: Simulation
