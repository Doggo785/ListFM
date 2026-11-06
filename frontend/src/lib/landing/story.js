/** The landing page's story as numbers: where the scroll is in it, and what the listens say. Maths only. */
import { smoothstep } from "@/lib/ribbonTrack";

export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// In screens of scroll. The chain gets the most: it's what must explain itself.
const SCENES = [
  ["listens", 2.2],
  ["chain", 4.8],
  ["delivered", 1.2],
  ["keeps", 2.2],
  ["obeys", 2.4],
];
const TRAVEL = SCENES.reduce((sum, [, length]) => sum + length, 0);
export const STORY_SCREENS = TRAVEL + 1; // The pin itself is one screen tall.

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

export function chainPhases(k) {
  return {
    scan: smoothstep(0, 0.1, k),
    window: smoothstep(0.1, 0.3, k),
    open: smoothstep(0.3, 0.4, k),
    filter: smoothstep(0.4, 0.6, k),
    sort: smoothstep(0.6, 0.8, k),
    limit: smoothstep(0.8, 0.97, k),
    // How many stages are done: the counters show their results, the sentence lights the one at work.
    stage: k < 0.3 ? 0 : k < 0.6 ? 1 : k < 0.8 ? 2 : k < 0.97 ? 3 : 4,
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

/** Where a date lies on the timeline that starts at `first` and holds these weeks. */
export function timelineShare(first, weeks, isoDate) {
  return (new Date(isoDate) - new Date(first)) / 86400000 / (weeks.length * 7);
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
