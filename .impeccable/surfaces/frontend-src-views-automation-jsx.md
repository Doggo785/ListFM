---
version: 1
slug: "frontend-src-views-automation-jsx"
primary_target: "frontend/src/views/Automation.jsx"
related_targets: ["frontend/src/views/Automations.jsx", "frontend/src/views/PlaylistNew.jsx", "frontend/src/lib/runs.js"]
---

Scope: an automation's page, its History, the last run on each Automations card, and the Creator used to edit. Mode: Operate.

## Direction contract

THESIS: People come back to read what ran with nobody watching. History is the page's main content and says plainly what happened and what happens next. Refuses the status dashboard and the coloured-dots log.

OWN-WORLD: Braise palette on ink, Tiny5 titles, Jersey 20 text, no radius, no shadow. Only failures and pending retries take the ember colour; short and empty runs stay neutral because they are results.

STORY: The visitor sees on the cards whether everything ran, opens an automation, reads its runs by day, opens a playlist, re-runs the latest failure with the same period, edits through the Creator, pauses or deletes.

FIRST VIEWPORT: Left column as on a playlist's page: cover, name, what it does, schedule, Run now, Edit, Pause, Delete. Right column: History, grouped by day, one line per run.

FORM: A plain list by day. Signature: the ribbon warms while the latest run is failed, and leans toward a line that is running.
