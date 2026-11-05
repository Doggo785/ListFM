import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import PlaylistCover from "@/components/ui/PlaylistCover";
import { describeAutomation, describeSchedule } from "@/lib/automation-rules";
import { ribbonStage } from "@/lib/pixelRibbon";
import { plural } from "@/lib/playlists";
import { cardCorners, cardPose, deckLayout, mix, monthsEnd, monthSeries, runsSeries, smoothstep, sweepAt, SWEEP_SECONDS } from "@/lib/ribbonTrack";
import { describeRun, RUN_TONES } from "@/lib/runs";
import { FOCUS } from "@/lib/utils";
import AlbumArt from "./AlbumArt";

const CARD_SIZES = [448, 384, 320, 256, 192];
const DECK_CHROME = 360; // The title row, the caption and the months around the cards.
const SCROLL_PER_CARD = 260;
const DEAL_SECONDS = 0.55;
const MAX_EMBERS = 180;
const BAND_ENDS = 0.02;
const NO_BAND = -100000;
const HERO_FLAME = 0.9;
const DECK_FLAME = 1;
const HERO_HALF_SHARE = 0.78; // Of the poster's line: the wave keeps inside it downward, only its flames leave, upward.
const DECK_HALF_SHARE = 0.4; // Of a card: only its tongues rise past the cards' top.
const BURN_FROM = 1.1; // Cards from the focus: the nearest neighbours stay whole, the next ones are burning.
const BURN_TO = 1.9;
const FLIGHT_EASE = 0.16; // Seconds: a wheel notch unrolls the flight instead of jumping it.
const CAPTION_LEVELS = [0.04, 0.14, 0.28]; // Of the way between two cards: its caption breaks up, swaps, and comes back.
const PARALLAX = 42; // Pixels the art slides inside its frame across a card's way.
const BOB = 5;
const IMAGE_ZOOM = 1.14;

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthDate = (month) => new Date(`${month}-01T00:00:00Z`);
// Scrolling never stops between two cards for long: each one dwells, facing us, then the next flies in.
const withDwell = (value) => Math.floor(value) + smoothstep(0.2, 0.8, value - Math.floor(value));
const boundsOf = (corners) => {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};
const brokenLevel = (value, levels) => levels.reduce((level, from, step) => (value > from ? levels.length - step : level), 0);

function monthCards(months) {
  return months.map((month, i) => ({
    key: month.month,
    tick: SHORT_MONTH.format(monthDate(month.month)),
    title: MONTH_LABEL.format(monthDate(month.month)),
    name: month.artist,
    lines: [
      `${month.artist_plays.toLocaleString("en-US")} of ${month.listens.toLocaleString("en-US")} listens${i === months.length - 1 ? " so far" : ""}`,
      month.album?.title,
    ].filter(Boolean),
    bare: !month.album?.cover_url,
    art: <AlbumArt url={month.album?.cover_url} seed={month.month} eager className="deck-card__art" />,
  }));
}

function automationCards(automations, playlists, runs) {
  const made = (automation) => playlists.filter((playlist) => playlist.automation_id === automation.id);
  const latestAt = (automation) => new Date(made(automation)[0]?.generated_at ?? automation.created_at ?? 0).getTime();
  const sorted = [...automations].sort((a, b) => latestAt(a) - latestAt(b));
  return [
    { key: "new", tick: "New", title: "New automation", name: null, lines: ["Describe a recipe once, and it makes your playlists."], to: "/automations/new", action: "Create one", sizes: [], bare: true, art: <PlaylistCover seed="new automation" className="size-full" /> },
    ...sorted.map((automation) => {
      const own = made(automation);
      const run = runs?.find((candidate) => candidate.automation_id === automation.id);
      return {
        key: automation.id,
        tick: automation.name || "Untitled",
        title: automation.name || "Untitled",
        name: null,
        lines: [describeAutomation(automation), automation.enabled === false ? "Paused" : describeSchedule(automation.cron)],
        outcome: run ? describeRun(run) : { label: plural(own.length, "playlist"), tone: "muted" },
        to: `/automations/${automation.id}`,
        action: "Open",
        sizes: own.map((playlist) => playlist.track_count).reverse(),
        bare: !own[0]?.cover_images?.length,
        art: <PlaylistCover seed={own[0]?.id ?? automation.id} images={own[0]?.cover_images} className="size-full" />,
      };
    }),
  ];
}

/** A flat shelf instead of the flight, for people who asked for less motion. */
function StillShelf({ cards }) {
  return (
    <ul className="flex gap-4 overflow-x-auto pb-4">
      {cards.map((card) => (
        <li key={card.key} className="w-[192px] shrink-0">
          <div className="deck-card--still">{card.art}</div>
          <Caption card={card} />
        </li>
      ))}
    </ul>
  );
}

function Caption({ card }) {
  return (
    <div className="min-w-0 pt-3">
      <p className="truncate font-heading text-4xl">{card.title}</p>
      {card.name && <p className="truncate text-lg">{card.name}</p>}
      {card.lines.map((line) => <p key={line} className="truncate text-xs text-(--text-muted)">{line}</p>)}
      {card.outcome && <p className={`truncate text-xs ${RUN_TONES[card.outcome.tone]}`}>{card.outcome.label}</p>}
      {card.to && <Link to={card.to} className={`${buttonVariants({ variant: "outline" })} mt-2`}>{card.action}</Link>}
    </div>
  );
}

/**
 * The year as a flight: the page's scroll rewinds it, each month's cover coming out of the left on a 3D arc,
 * facing us in the middle of the flame and leaving by the right. The cards live under the ribbon's canvas;
 * this component also drives the ribbon, from the poster's line down to the drum.
 */
export default function YearDeck({ scrollerRef, lineRef, story, automations, playlists, runs, reducedMotion }) {
  const months = story.months;
  const [view, setView] = useState(months.length ? "months" : "automations");
  const [card, setCard] = useState(CARD_SIZES[1]);
  const [height, setHeight] = useState(0);
  const [armed, setArmed] = useState(false); // The covers are large: asked for only when the flight is near.
  const [focusIndex, setFocusIndex] = useState(0);
  const [layer, setLayer] = useState(null);
  const wrap = useRef(null);
  const anchor = useRef(null);
  const caption = useRef(null);
  const ticks = useRef(null);
  const elements = useRef([]);
  const dealtAt = useRef(0);
  const startedAt = useRef(0);
  const shownFocus = useRef(-1);

  const cards = useMemo(
    () => (view === "months" ? monthCards(months) : automationCards(automations, playlists, runs)),
    [view, months, automations, playlists, runs],
  );
  const monthsTrack = useMemo(() => ({ series: monthSeries(months), end: monthsEnd(months), count: Math.max(1, months.length) }), [months]);
  const cardsTrack = useMemo(
    () => (view === "months" ? monthsTrack : { series: runsSeries(cards.map((c) => c.sizes ?? [])), end: cards.length, count: cards.length }),
    [view, monthsTrack, cards],
  );
  const travel = Math.max(0, cards.length - 1) * SCROLL_PER_CARD;

  useLayoutEffect(() => {
    setLayer(document.getElementById("under-ribbon"));
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      // The parent, not scrollerRef: a child's layout effect runs before its parent's ref is set.
      const available = wrap.current.parentElement.clientHeight;
      const fits = CARD_SIZES.find((size) => size <= available - DECK_CHROME && size <= window.innerWidth - 48) ?? CARD_SIZES.at(-1);
      setCard(fits);
      setHeight(available);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    startedAt.current ||= performance.now();
    const stage = document.getElementById("under-ribbon");
    const track = { holes: [], x0: 0, perMonth: 1, zoom: 0, cx: 0, focus: 0, layout: deckLayout(window.innerWidth, card), head: -9999, flame: HERO_FLAME };
    let flown = null;
    let flownAt = 0;
    const drive = () => {
      const scroller = scrollerRef.current;
      const line = lineRef.current;
      if (!scroller || !line) return;
      const now = performance.now();
      const box = scroller.getBoundingClientRect();
      const wrapTop = wrap.current ? wrap.current.getBoundingClientRect().top - box.top : Number.POSITIVE_INFINITY;
      const width = window.innerWidth;
      if (wrapTop < box.height * 2) setArmed(true);
      const zoom = reducedMotion || !cards.length ? 0 : 1 - smoothstep(box.height * 0.05, box.height * 0.7, wrapTop);
      const progress = travel ? Math.min(1, Math.max(0, -wrapTop / travel)) : 0;
      const aimed = withDwell((cards.length - 1) * (1 - progress));
      flown = flown === null ? aimed : aimed + (flown - aimed) * Math.exp(-Math.max(0, now - flownAt) / 1000 / FLIGHT_EASE);
      flownAt = now;
      const focus = flown;
      const anchorRect = anchor.current?.getBoundingClientRect();
      const cx = anchorRect ? anchorRect.left + anchorRect.width / 2 : width / 2;
      const cy = anchorRect ? anchorRect.top + anchorRect.height / 2 : box.height;
      const layout = deckLayout(width, card);
      const deal = reducedMotion ? 1 : smoothstep(0, DEAL_SECONDS, (now - dealtAt.current) / 1000);
      const shown = Math.min(zoom, deal);

      if (stage && !reducedMotion) {
        stage.style.visibility = zoom > 0.005 ? "visible" : "hidden";
        stage.style.perspective = `${layout.perspective}px`;
        stage.style.perspectiveOrigin = `${cx}px ${cy}px`;
      }
      const holes = [];
      if (zoom > 0.005 && !reducedMotion) {
        elements.current.forEach((element, i) => {
          if (!element) return;
          const { theta, arc, roll, turn, sink } = cardPose(i, focus, layout);
          const away = Math.abs(theta);
          const burn = smoothstep(BURN_FROM, BURN_TO, away / layout.step);
          if (burn >= 1 || shown < 0.01) {
            element.style.visibility = "hidden";
            return;
          }
          const fall = 1 - shown;
          const x = cx - fall * width * 0.55;
          const y = cy + arc + fall * 90 + Math.sin(now / 1500 + i * 1.7) * BOB;
          const depth = -layout.radius - sink - fall * 1100;
          element.style.visibility = "visible";
          element.style.zIndex = String(100 - Math.round(away * 50));
          element.style.transform = `translate3d(${x - card / 2}px,${y - card / 2}px,${depth}px) rotateY(${theta}rad) translateZ(${layout.radius}px) rotateY(${turn}rad) rotateZ(${roll}rad)`;
          const level = fall > 0.5 ? 1 : fall > 0.2 ? 2 : 0;
          if (element.dataset.far !== String(level)) element.dataset.far = String(level);
          const art = element.firstElementChild?.firstElementChild;
          // Facing us the cover is whole: the zoom that leaves room for the parallax only comes as it turns.
          const turned = smoothstep(0, layout.step, away);
          if (art) art.style.transform = `translateX(${(-theta / layout.step) * (PARALLAX / 2)}px) scale(${1 + (IMAGE_ZOOM - 1) * turned})`;
          const corners = cardCorners({ x, y, depth, theta, turn, roll, size: card, originX: cx, originY: cy, layout });
          holes.push({ corners, rect: boundsOf(corners), strength: shown, burn, away });
        });
      }

      const rounded = Math.round(focus);
      if (caption.current) caption.current.dataset.far = String(brokenLevel(Math.abs(focus - rounded), CAPTION_LEVELS));
      if (rounded !== shownFocus.current) {
        shownFocus.current = rounded;
        setFocusIndex(rounded);
      }

      // The ribbon: the whole year across the poster, then wrapped on the drum.
      const source = zoom > 0.5 || !months.length ? cardsTrack : monthsTrack;
      const lineRect = line.getBoundingClientRect();
      const seconds = reducedMotion ? SWEEP_SECONDS : (now - startedAt.current) / 1000;
      const perMonth = width / Math.max(0.01, source.end);
      const rest = width - 28 + (reducedMotion ? 0 : Math.sin(now / 420) * 10);
      const heroHead = seconds < SWEEP_SECONDS ? sweepAt(seconds) * width : rest;
      const heroY = lineRect.top + lineRect.height / 2;
      const heroHalf = (lineRect.height / 2) * HERO_HALF_SHARE;
      const deckHalf = card * DECK_HALF_SHARE;
      Object.assign(track, {
        series: source.series,
        end: source.end,
        count: source.count,
        x0: 0,
        perMonth,
        zoom,
        cx,
        focus,
        layout,
        y: mix(heroY, cy, zoom),
        half: mix(heroHalf, deckHalf, zoom) * mix(1, deal, zoom),
        head: mix(heroHead, cx, zoom),
        flame: mix(HERO_FLAME, DECK_FLAME, zoom),
        // Between the two, no band: the poster's text passes by, and the flame must part around it.
        bandTop: zoom < BAND_ENDS ? lineRect.top : zoom > 1 - BAND_ENDS ? cy - card / 2 : NO_BAND,
        bandBottom: zoom < BAND_ENDS ? lineRect.bottom : zoom > 1 - BAND_ENDS ? cy + card / 2 + layout.bow * 0.5 : NO_BAND,
        holes: holes.sort((a, b) => a.away - b.away),
      });
      ribbonStage.track = track;
      ribbonStage.embers = Math.min(MAX_EMBERS, story.listens_last_day);
    };
    drive();
    let frameId = 0;
    if (ribbonStage.alive) {
      ribbonStage.beforeDraw = drive;
    } else {
      const loop = () => {
        drive();
        frameId = window.requestAnimationFrame(loop);
      };
      frameId = window.requestAnimationFrame(loop);
    }
    return () => {
      window.cancelAnimationFrame(frameId);
      ribbonStage.beforeDraw = null;
      track.holes = []; // The cards go with the page at once; the flame closes over where they were.
      ribbonStage.track = null;
      ribbonStage.embers = 0;
      if (stage) stage.style.visibility = "hidden";
    };
  }, [months.length, cards, card, travel, cardsTrack, monthsTrack, reducedMotion, scrollerRef, lineRef, story.listens_last_day]);

  // A long list of automations scrolls sideways: the current one stays in view.
  useEffect(() => {
    const list = ticks.current;
    const tick = list?.children[focusIndex];
    if (tick) list.scrollLeft = tick.offsetLeft - (list.clientWidth - tick.offsetWidth) / 2;
  }, [focusIndex, cards]);

  const jumpTo = useCallback(
    (index) => {
      const scroller = scrollerRef.current;
      const top = scroller.scrollTop + wrap.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollTo({ top: top + travel * (1 - index / (cards.length - 1)), behavior: "smooth" });
    },
    [scrollerRef, cards.length, travel],
  );

  const choose = (next) => {
    if (next === view) return;
    dealtAt.current = performance.now();
    shownFocus.current = -1;
    // A new deck starts on its newest card, at the top of the flight.
    const scroller = scrollerRef.current;
    scroller.scrollTop += wrap.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    setView(next);
  };

  const current = cards[Math.min(cards.length - 1, focusIndex)];
  const title = view === "months" ? "Your year" : "Your automations";

  return (
    <section ref={wrap} className="deck" aria-label={title} style={reducedMotion ? undefined : { height: height + travel }}>
      <div className="deck__pin" style={{ "--deck-card": `${card}px`, height: reducedMotion ? undefined : height }}>
        <div className="deck__head">
          <h2 data-quiet className="text-4xl md:text-5xl">{title}</h2>
          {months.length > 0 && (
            <div data-quiet role="group" aria-label="Show" className="flex gap-2">
              <Button variant={view === "months" ? "default" : "outline"} aria-pressed={view === "months"} onClick={() => choose("months")}>Months</Button>
              <Button variant={view === "automations" ? "default" : "outline"} aria-pressed={view === "automations"} onClick={() => choose("automations")}>Automations</Button>
            </div>
          )}
        </div>
        {reducedMotion ? (
          <StillShelf cards={cards} />
        ) : (
          <>
            <div ref={anchor} className="deck__anchor" aria-hidden="true" />
            <div ref={caption} data-quiet className="deck__caption">
              {current && <Caption card={current} />}
            </div>
            {cards.length > 1 && (
              <ol ref={ticks} data-quiet className="deck__ticks">
                {cards.map((item, i) => (
                  <li key={item.key} className="shrink-0">
                    <button
                      type="button"
                      aria-current={i === focusIndex ? "true" : undefined}
                      aria-label={item.name ? `${item.title}: ${item.name}` : item.title}
                      onClick={() => jumpTo(i)}
                      className={`deck__tick ${FOCUS}`}
                    >
                      {item.tick}
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {layer &&
              armed &&
              // Straight under the layer: perspective only reaches an element's direct children.
              createPortal(
                cards.map((item, i) => (
                  <div
                    key={item.key}
                    aria-hidden="true"
                    ref={(element) => {
                      elements.current[i] = element;
                    }}
                    className="deck-card"
                    style={{ width: card, height: card }}
                  >
                    <div className={`deck-card__frame ${item.bare ? "deck-card__frame--bare" : ""}`}>{item.art}</div>
                  </div>
                )),
                layer,
              )}
          </>
        )}
      </div>
    </section>
  );
}
