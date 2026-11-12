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

One dithered ember ribbon is the site's only ornament, and it never restarts: it travels between pages and changes shape and heat. Everything else stays out of its way, on an ink ground with hairlines instead of cards. Written from the finished site, the Creator (`frontend/src/views/PlaylistNew.jsx`) first. Two screens are loud: the Dashboard, a poster of what you listen to over your year in flight, and the landing page, where the ribbon comes apart to show what it does.

## Colors

Ink ground, warm cream text, the Braise ramp for the ribbon only, amber for actions and the current choice. Secondary text is the warm `text-muted`, never a grey. Hairlines are amber at low alpha. The tokens live in `frontend/src/index.css`, where amber is `--ember-8` (aliased `--ember`, the accent) and amber-hot `--ember-9`; the oklch tokens below them are leftovers of the old kit, not part of this world.

## Typography

Tiny5 for titles and numerals, Jersey 20 for everything read closely. Both are pixel fonts: only the sizes of the `--text-*` scale stay sharp, there is no letter-spacing and no other weight, so hierarchy comes from size and colour. Tiny5 numerals are hard to read small: use them at 24px or more.

## Layout

A 4px grid, the size of a ribbon pixel. Work screens read top to bottom in hairline-separated rows, with a label, a control and a result. The Creator keeps settings and preview side by side from `lg` and stacks them below, with no horizontal scroll at 390px. Layouts are left-aligned: pages opt out of the old global `text-align: center` until it is removed.

## Elevation & Depth

Flat. No shadows, no glow, no glass. Overlays are set apart by an amber border. The Dashboard's flight is the one place with real depth: its covers turn on a 3D drum, under the ribbon's canvas.

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
- `PlaylistCover`: the playlist's first two albums in their original quality, cut apart by the site's ribbon (same formula and dither, 64 cells across). Height, slope, width and heat come from the playlist's id, always in Braise, with no text and no animation. One album fills the cover; with none, the ribbon alone on the ground. Size it in multiples of 64px so its cells stay whole: 192, 128 or 384.
- Album shelf during a first import: no cover is looked up yet, so each album's square says "Covers come after the import" in muted text on the ground, with a hairline edge, instead of showing the ribbon alone.
- Shelf: one per automation, covers in a row that scrolls sideways, each with the period it covers under it. The period is what tells apart the playlists of one automation.
- Leaving ListFM: `Send to your app` is the page's one primary button. It copies the list and opens a modal with the steps on Tune My Music (choose Free text, paste, pick your app), the things to look for drawn as outlined keys; its OK opens Tune My Music in a new tab. The steps come before the new tab, which would hide them. It carries no cover, so `Download cover` gives the same cover as a 384 px PNG to add by hand.
- Playlist glide: opening a playlist and going back slides its cover, name and period with a view transition, and the rest of the page swaps at once. Without browser support or under reduced motion, it all swaps at once.
- Automation card: the only bordered card, a whole link holding a cover and a few lines, the last one saying how its latest run went. Its border turns amber on hover.
- Run line: time, then what the run came to, one line per run under its day. Only a failure or a pending retry takes the ember colour: a short or empty run is a result, so it stays neutral. Attempts fold under the line.
- Background task: one line of `text-muted` in the top bar, between the links and the account, saying what is at work (an import, a tag pass, a run) with its progress and time left, over a thin amber bar that glides between two reads (`--duration-poll`). It never wraps, so the bar's height never moves the page. It leaves when the work is done.
- Guide: the newcomer's tour on the real screens. An amber frame breathes around what a step shows, slides to the next one (`--duration-slide`), and a bubble on the ground with an amber border stands beside it, its arrow pointing in; on a phone the bubble docks at the bottom, or the top when what it shows is down there. Skip, Back and Next are small text and outline buttons, the step's own action stays the page's. Leaving the step's page leaves a `Resume guide` button at the bottom. Static under reduced motion.
- State pages (`StatePage`, `LoadFailed`): the 404 and a failed load are plain text on the ground, a Tiny5 title, a muted line and one way on, never an illustration.
- Privacy: one reading column (720px) of hairline-separated sections, Tiny5 headings, no table.
- Last.fm: every artist, album and track shown opens its Last.fm page (`LastfmLink`), with no other styling than the text it is; a page showing Last.fm data carries `LastfmCredit`, a muted "Powered by AudioScrobbler" line.
- Ribbon band: an empty `data-chain` element pulls the ribbon straight into it, with the widths set by its counts. Text never sits in it.
- The Dashboard's ribbon: the same ribbon, fed through `ribbonStage`. Its width is the listens day by day, with a playhead that crosses once and stays breathing at the right edge, flame tongues rising from it, and one ember per listen of the last day. It keeps to its line under the name and past it sweeps up into the free room, the same long bend as on the other pages. It morphs from and to every page's scene without a second canvas.
- Forged name: the top artist in Tiny5, as large as it fits, at sizes that land on the 4px grid (multiples of 32). The playhead sets it on fire, from cold iron to cream, once per page load. After that a flame crosses it now and then, and each pass takes the letters down to red and back up to cream, so a flame never crosses letters that don't react. The pointer does nothing to it. The page's own text stays underneath, sharp and selectable. It is plain under reduced motion, and shortened when too long for any size.
- Auth screen (`AuthScreen`): every screen before the site. "ListFM" forged in giant on the left, with the ribbon lying under it, and one task on the right, stacked on a phone with the ribbon under the form. They share one ribbon scene, so moving between them leaves it still and logging in only moves it a little. The name burns once per page load, with no later flames.
- Mail screens (confirm an address, forgot and reset a password) are `AuthScreen` tasks like Log in: one form, one primary button, and a line that says what was sent without saying whether the address has an account.
- Settings: hairline rows on the left, title and note then the control, with the ribbon running down the free side. A destructive or surprising action goes through `Modal`; the account's deletion asks for the email to be typed.
- Flight: the page's scroll rewinds the year, newest first. Covers come out of the left on a 3D arc, dwell facing the visitor, and leave by the right, each month's top artist with their own album. Only the card in front is flat and at full size: its neighbours turn and sit back in real perspective. Further along the arc a card burns away before it goes edge-on: a ragged front with a glowing rim and charred pixels eats it from its outer side inward, and an arriving card comes out of the fire the same way. The flight eases over a few tenths of a second, so a wheel notch unrolls instead of jumping. The ribbon wraps the same drum, opens around the cards and burns from their edges, in a crown over their top and separate tongues up their sides, nothing at their foot. Months and Automations share the deck, and its ticks scroll sideways when they don't fit. Under reduced motion it is a flat shelf that scrolls sideways.

- Landing page: the only page with a canvas of its own (`lib/landing/stage.js`), on the ribbon's grid, with its dither and its ramps: there the thread must be able to come apart, which the shader can't do. The shader stays silent under it (`silent` on the scene) and takes over from the same place when the visitor leaves. It reads where the text is (`data-quiet`) and draws around it, and it lies over the page so a `data-reveal` block can come in as dither. The story moves in beats half a screen apart, scrubbed and snapped like scroll-driven sites do: the show follows the scroll about 0.3 s behind, never more than 5 beats a second, and 0.15 s after the scroll stops the page glides (0.3 to 0.9 s, ease-out) to the next beat the way it went, or back to one it barely left. Backwards too. It never glides while a finger or a hand on the scrollbar still holds the page. No CSS scroll snap: it fights trackpads. At each hold the clause just applied lights up with its counter, in step with the picture. A rail on the right names the scenes and jumps to one at once, without replaying the steps between; only its current label takes room from the thread. On a phone a line fills along the bottom instead. Both leave with the story. Only the falling pixels have a memory. Under reduced motion there is no canvas and every scene is there, one after the other.
- Thread: what the copy calls the ribbon on the landing page. A presence with no face and no voice, in the third person. It breathes, runs as a fuse, works, rests, and leans a little toward a pointer once nothing else happens, never over the forged name. On this page it stays the sober ribbon, dithered reds with no flames: only a forged name burns here, and the thread's own pixels fall instead. On the Dashboard the same thread burns as a flame with the listens, and the guide introduces it there.
- Chain squares: one square per track of a real month, 8 CSS px, hotter the more it was played. The Window sheds the years down to the month, the squares open out of it, the Filters' sweep drops what doesn't pass, the Sort lines the rest up from cream to red, and a blade cuts after the playlist's size.

## Do's and Don'ts

- Do tell the truth about the result: short runs, empty runs and unknown tags are stated in the preview.
- Do keep anything the server can do within reach, folded when it is advanced.
- Do keep motion to state changes, and keep a complete experience under reduced motion. The landing page is the exception: there motion is the content, tied to the scroll.
- Don't add other cards, rounded corners, gradients, glow or a second ornament.
- Don't set text over the ribbon. Mark content blocks `data-quiet` (12 at most on screen). The forged name is the one exception: it is the fire's subject.
- Don't use the ember ramp for interface text or controls.
