# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are the general public: anyone with a Last.fm history who wants good playlists made for them, without learning how the product works. Defaults must carry them to a useful result.

Power users are served by the same product, not a separate one. Very advanced recipes must be fully within their reach, with every control available once they go looking for it.

## Product Purpose

ListFM is a machine that makes playlists automatically from a person's Last.fm listening history. A person describes a recipe once, and ListFM produces playlists from it, on demand or on a schedule, and keeps a readable history of every run.

Success means the end-to-end loop is reliable (automation, then playlist, then history), and the result is exactly what the settings promise.

The final goal is for people to import their playlists directly into their streaming apps. That does not exist yet.

## Positioning

ListFM works from everything a person has listened to, because Last.fm logs listening across services, where a single streaming service only knows its own partial history. On top of that history it offers recipes that keep working by themselves, with near-limitless precision: which listens to look at, what to keep, how to rank them, and what to cap.

## Operating Context

- A person first connects a Last.fm account. Their listens are copied into ListFM once, which can take minutes for a long history, then only new listens are fetched. A tag catalogue fills in the background afterwards, so tag filters can be incomplete for a while. The interface has to be honest about both.
- Building an automation is an iterative session: change a setting, read the preview, adjust. Scheduled runs then happen with nobody watching, so people come back to read results and history rather than to operate anything.
- Generated playlists currently live inside ListFM.

## Capabilities and Constraints

**Interface language:** English only.

**Terminology:** users see Automation (the recipe), Playlist (the frozen result of a run), Run, History, Listens, Sync, Window, Filter, Sort, Limit, Preset and Preview. Never call an automation a playlist. The definitions are in `GLOSSARY.md`.

**Confirmed capabilities:**
- The chain of an automation is Window, then Filters, then Sort, then Limits.
- Windows can be rolling, offset ("the same month a year ago") or all listens.
- Filters cover tags, loved tracks, play counts, first listen, top artists and listening moment, in AND/OR groups up to two levels deep.
- Sorts are most played, most recently played, most recently discovered and random (optionally weighted by plays).
- Limits are playlist size, maximum per artist, maximum per album (a reissue counts as its original album) and no repeats across the last N playlists.
- The server preview shows what a run would produce now, with a count at each stage of the chain and the share of known tags.
- Each automation has a run history, with retries that keep the original scheduled date, and short or empty runs are shown as such rather than as failures.
- Sign-in is by password, Google or Discord.

**Constraints:**
- Last.fm is the only listening source, permanently. No other provider is planned as a source.
- Running filters makes no Last.fm calls, and every product change aims for fewer calls.
- A field that has not been fetched passes no filter, so unknown data must never read as a negative result.
- Tokens stay in httpOnly cookies, internal errors are not shown to users, and there is no unnecessary tracking.

**Open decisions:**
- When streaming-app import ships, and for which apps. It is the stated final goal but needs its own go-ahead. Shape the owner has in mind: link music accounts in the future settings, import a playlist from its page, and set auto-import on each automation. Before sending covers anywhere, check the rights on altered album art and each service's image limits; drawing the cover would also move to the server, since auto-import runs with no browser open. An image creator is left for after v1.
- Whether the public can actually sign up at v1.0.0. The current deployment is a small single-worker VPS used by the owner and friends.

## Brand Commitments

- Type: Tiny5 for titles and numerals, Jersey 20 for reading text, chosen by the owner on 2026-11-04. Both are under the SIL Open Font License.
- The name is ListFM. There is no logo yet: `frontend/public/favicon.svg` is not a brand asset.
- The whole site is built around one art direction and is animated throughout, with clean transitions between pages. One precise style carries across every page and evolves from page to page. This is the owner's ultimate goal for the interface, so it is a foundation rather than a finishing touch.
- That art direction is pixel: a dithered ember ribbon roams every page, guides the eye and changes shape and heat with each page, while always staying secondary to the content. Inspired by the Wave shader by Ali Imam on 21st.dev, whose code is not reused because its licence is unknown.
- The palette is Braise, on a dark ground: 03071e, 370617, 6a040f, 9d0208, d00000, dc2f02, e85d04, f48c06, faa307, ffba08.
- Changing page must feel instant: the content swaps at once and only the ribbon travels. No transition covers the screen or makes anyone wait.
- The sidebar is gone, and the previous look is not a reference for anything.
- The interface must be meticulous and intuitive, and must not feel overloaded.
- It must not look like a generic AI-made page.

## Evidence on Hand

- Real demonstration material exists: the owner's Last.fm history and automations in the development database.
- There are no testimonials, customer logos, usage figures, press or pricing. Do not invent any.
- The name of Last.fm and of streaming services describe real integrations only. No partnership or endorsement exists.

## Product Principles

1. **Simple by default, nothing out of reach.** A first-time user gets a good playlist from defaults, and a power user can reach every control. Advanced settings stay folded until wanted.
2. **Exact over impressive.** The result does what the settings say, and the preview tells the truth about it.
3. **Honest about what is unfinished.** First load, missing tags, short runs and failures are stated plainly, along with what they change for the result.
4. **Respect for the source.** Reuse what is already stored and keep Last.fm calls to a minimum.
5. **Speed survives the show.** Animation is core to the product and never makes a repeated task slower.

## Accessibility & Inclusion

No specific standard has been set. The motion commitment above requires a full experience with reduced motion, and accessible modals (role, focus, Escape) are already planned in the roadmap.
