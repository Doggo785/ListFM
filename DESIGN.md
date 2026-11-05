---
name: ListFM
description: Playlists made from a Last.fm history, on a dithered ember ribbon
colors:
  ink: "#03071e"
  text: "#fff3d6"
  text-muted: "#e0bd9c"
  line: "#ffba0838"
  control: "#94722f"
  ember-1: "#370617"
  ember-2: "#6a040f"
  ember-3: "#9d0208"
  ember-4: "#d00000"
  ember-5: "#dc2f02"
  ember-6: "#e85d04"
  ember-7: "#f48c06"
  amber: "#faa307"
  amber-hot: "#ffba08"
typography:
  display:
    fontFamily: "Tiny5"
    fontSize: "48px"
    lineHeight: "56px"
    fontWeight: 400
    letterSpacing: "0em"
  numeral:
    fontFamily: "Tiny5"
    fontSize: "32px"
    lineHeight: "40px"
    fontWeight: 400
    letterSpacing: "0em"
  body:
    fontFamily: "Jersey 20"
    fontSize: "20px"
    lineHeight: "24px"
    fontWeight: 400
    letterSpacing: "0em"
rounded:
  none: "0px"
spacing:
  grid: "4px"
  row: "12px"
  gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.amber-hot}"
  button-outline:
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    height: "40px"
  field:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    height: "40px"
---

# ListFM

## Overview

One dithered ember ribbon is the site's only ornament, and it never restarts: it travels between pages and changes shape and heat. Everything else stays out of its way, on an ink ground with hairlines instead of cards. Written from the Creator, the first screen built entirely in this world (`frontend/src/views/PlaylistNew.jsx`). The other screens still carry old styling until their turn in Phase C, so they are not a reference.

## Colors

Ink ground, warm cream text, the Braise ramp for the ribbon only, amber for actions and the current choice. Secondary text is the warm `text-muted`, never a grey. Hairlines are amber at low alpha. The tokens live in `frontend/src/index.css`.

## Typography

Tiny5 for titles and numerals, Jersey 20 for everything read closely. Both are pixel fonts: only the sizes of the `--text-*` scale stay sharp, there is no letter-spacing and no other weight, so hierarchy comes from size and colour. Tiny5 numerals are hard to read small: use them at 24px or more.

## Layout

A 4px grid, the size of a ribbon pixel. Work screens read top to bottom in hairline-separated rows, with a label, a control and a result. The Creator keeps settings and preview side by side from `lg` and stacks them below, with no horizontal scroll at 390px. Layouts are left-aligned: pages opt out of the old global `text-align: center` until it is removed.

## Elevation & Depth

Flat. No shadows, no glow, no glass. Overlays are set apart by an amber border.

## Shapes

Square corners everywhere, 2px borders on controls, 1px hairlines between rows.

## Components

- Controls (`Button` outline, `CustomSelect`, `Input`) are edged with `--control`, at least 3:1 on the ground. `--line` stays for hairlines between rows.
- On touch screens (`pointer-coarse`), controls are 44px tall.
- A scrolling page carries `.scroll-edge`: it dissolves in dither under the bar above it, and the ribbon's band leaves with it.
- `Button`: `default` for the one primary action and the selected choice, `outline` for the rest, `danger` for destruction.
- `Input`, `NumberInput`, `CustomSelect`: same height and border, and the focus or hover state turns the border amber.
- Folded sections are native `details`, and the closed row still states what it holds ("4 rules").
- `PixelNumber`: every Tiny5 number. Random ember pixels gather on the digits, never in a box, with a few loose ones around. It swaps under them and they leave one by one, in under half a second. It swaps at once under reduced motion.
- Live lists: a kept row slides to its new place, a new one dithers in, and a dropped one steps out. The list never empties while it updates.
- `PlaylistCover`: a square of 16 cells, a dithered ember band drawn from the playlist's id. Sized in px in multiples of 16, since the rem scale would make uneven cells.
- Shelf: one per automation, covers in a row that scrolls sideways, each with the period it covers under it. The period is what tells apart the playlists of one automation.
- Playlist glide: opening a playlist and going back slides its cover, name and period with a view transition, and the rest of the page swaps at once. Without browser support or under reduced motion, it all swaps at once.
- Automation card: the only bordered card, a whole link holding a cover and a few lines. Its border turns amber on hover.
- Ribbon band: an empty `data-chain` element pulls the ribbon straight into it, with the widths set by its counts. Text never sits in it.

## Do's and Don'ts

- Do tell the truth about the result: short runs, empty runs and unknown tags are stated in the preview.
- Do keep anything the server can do within reach, folded when it is advanced.
- Do keep motion to state changes, and keep a complete experience under reduced motion.
- Don't add other cards, rounded corners, gradients, glow or a second ornament.
- Don't set text over the ribbon. Mark content blocks `data-quiet` (12 at most on screen).
- Don't use the ember ramp for interface text or controls.
