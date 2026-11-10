/** The landing page's story as numbers: where the scroll is in it, and what the listens say. Maths only. */
import { smoothstep } from "@/lib/ribbonTrack";

export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The share of the show each scene plays in. The chain gets the most: it's what must explain itself.
const SCENES = [
  ["listens", 2.2],
  ["chain", 4.8],
  ["delivered", 1.2],
  ["keeps", 2.2],
  ["obeys", 2.4],
];
const TRAVEL = SCENES.reduce((sum, [, length]) => sum + length, 0);
// Of a screen: the scroll from one beat to the next. A wheel notch moves part of the way, and the page settles the rest.
export const BEAT_SCREENS = 0.5;
/** How tall the story is, in screens: a short scroll per beat, and the pin itself one screen tall. */
export const storyScreens = (beats) => (beats.length - 1) * BEAT_SCREENS + 1;

/** Which scene the visitor is in, and how far through it, from how far through the pinned story. */
export function storyAt(p) {
  let from = 0;
  for (const [scene, length] of SCENES) {
    const share = length / TRAVEL;
    if (p < from + share) return { scene, k: clamp((p - from) / share) };
    from += share;
  }
  return { scene: SCENES.at(-1)[0], k: 1 };
}

export const SCENE_NAMES = SCENES.map(([scene]) => scene);

/** Where each scene starts, as a share of the pinned story. */
export const sceneStarts = () => {
  let from = 0;
  return SCENES.map(([, length]) => {
    const start = from;
    from += length / TRAVEL;
    return start;
  });
};

// Of a scene: where the show holds, once a step has said what it changes. Keeps and Obeys hold once per run and per recipe.
const SWEPT = 0.9; // The listens: the playhead has crossed the years, and the albums are still up.
// Just short of a scene's end: its very end is already the next scene's start.
const END = 0.999;
const CHAIN_STEPS = [0.3, 0.6, 0.8, END]; // Window, Filters, Sort, Limit: each one done, the next not begun.
const BEFORE_MORPH = 0.8; // Of a recipe: its shape is whole, the next one not yet coming in.

/** The story's beats, as shares of it: a little scroll plays a whole step, then the show holds there. */
export function storyBeats(runs, recipes) {
  const holds = {
    listens: [SWEPT],
    chain: CHAIN_STEPS,
    delivered: [END],
    keeps: Array.from({ length: runs }, (_, i) => (i === runs - 1 ? END : (i + 1) / runs - 1 + END)),
    obeys: Array.from({ length: recipes }, (_, i) => (i === recipes - 1 ? 1 : (i + BEFORE_MORPH) / recipes)),
  };
  const starts = sceneStarts();
  return [0, ...SCENES.flatMap(([scene, length], i) => holds[scene].map((k) => starts[i] + (k * length) / TRAVEL))];
}

const NEAR = 0.08; // Of a beat: this close, the page settles back on it whatever the way.

/** Where the page settles once the scroll stops, from the beat it's at: the next one the way it went, as scroll-driven sites snap. */
export function beatToSettle(count, at, down) {
  const nearest = Math.round(at);
  if (Math.abs(at - nearest) < NEAR) return clamp(nearest, 0, count - 1);
  return clamp(down ? Math.ceil(at) : Math.floor(at), 0, count - 1);
}

/** A fractional beat as a share of the story: between two beats, the way is straight. */
export function shareAtBeat(beats, f) {
  const i = clamp(Math.floor(f), 0, beats.length - 1);
  if (i === beats.length - 1) return beats[i];
  return beats[i] + (beats[i + 1] - beats[i]) * (f - i);
}

export function chainPhases(k) {
  return {
    scan: smoothstep(0, 0.1, k),
    window: smoothstep(0.1, 0.3, k),
    open: smoothstep(0.3, 0.4, k),
    filter: smoothstep(0.4, 0.6, k),
    sort: smoothstep(0.6, 0.8, k),
    limit: smoothstep(0.8, 0.97, k),
    // How many stages are done: the counters show their results, the sentence lights the one just applied.
    // A hair before each hold, so a hold reached from below already says what its picture shows.
    stage: k < 0.29 ? 0 : k < 0.59 ? 1 : k < 0.79 ? 2 : k < 0.97 ? 3 : 4,
  };
}

/** A pixel's breath: two beats and a third, the last one the moment it decides to go. */
export const heartbeat = (t) => Math.exp(-(((t - 0.5) / 0.09) ** 2)) + 0.7 * Math.exp(-(((t - 0.78) / 0.09) ** 2)) + 1.2 * Math.exp(-(((t - 1.5) / 0.12) ** 2));

/** How many listens lie before this point of the timeline. */
export function listensUpTo(weeks, share) {
  const at = clamp(share) * weeks.length;
  const whole = Math.floor(at);
  const before = weeks.slice(0, whole).reduce((sum, count) => sum + count, 0);
  return Math.round(before + (weeks[whole] ?? 0) * (at - whole));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a date lies on the timeline that starts at `first` and holds these weeks. */
export function timelineShare(first, weeks, isoDate) {
  return (new Date(isoDate) - new Date(first)) / DAY_MS / (weeks.length * 7);
}

const TICK_EVERY_MONTHS = 6;

/** A label every six months along the timeline, from its first January or July. */
export function timelineTicks(first, weeks) {
  const start = new Date(first);
  const ticks = [];
  const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() < 6 ? 0 : 6, 1));
  if (date < start) date.setUTCMonth(date.getUTCMonth() + TICK_EVERY_MONTHS);
  for (;;) {
    const share = timelineShare(first, weeks, date.toISOString());
    if (share >= 1) return ticks;
    ticks.push({ label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), share });
    date.setUTCMonth(date.getUTCMonth() + TICK_EVERY_MONTHS);
  }
}
