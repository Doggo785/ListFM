---
version: 1
slug: "frontend-src-views-playlists-jsx"
primary_target: "frontend/src/views/Playlists.jsx"
related_targets: ["frontend/src/views/Playlist.jsx"]
---

Scope: Playlists tab and the full-screen playlist page. Mode: Operate.

## Direction contract

THESIS: Playlists are something you collected, not rows of a report. Each automation owns a shelf, each playlist a mosaic of its own album art, pixelated. Refuses the admin table and the old tilted cards.

OWN-WORLD: Braise palette on ink, Tiny5 titles, Jersey 20 text, square album-art mosaics enlarged until their pixels show, no radius, no shadow, no gradient.

STORY: The visitor sees what their automations made, tells seasons apart by the period under each cover, opens one, listens through Last.fm links, copies it, or deletes it.

FIRST VIEWPORT: Nav with Dashboard, Automations, Playlists. Left-aligned Playlists title with count. Free ribbon around the content. Then shelves: automation name, cadence, horizontal row of 192px covers (144px on phones), period and track count under each.

FORM: Shelves of covers, position 6 on the ordered list; seed:ec38828202ff6e58. Signature interaction: opening glides the cover, name and period to the full-screen page and back.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
