# One source and a Window → Filters → Sort → Limits chain

The 4 sources (top tracks, recent, loved, top artists) were only fixed combinations of window, filter and sort, and each read different settings without saying so. Since listens are stored locally (ADR 0001), an automation always starts from the person's listens and runs them through the same chain: Window, Filters, Sort, Limits. The old sources become presets that prefill that chain.

## Consequences

- No migration of existing automations: they were tests, the old format is dropped.
- The "top artists" source no longer does discovery (popular tracks never listened to): it becomes the filter "artist in your top N". Discovery, if it comes back, will be a separate feature.
