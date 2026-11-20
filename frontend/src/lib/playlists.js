import { describePeriod, describeSchedule, formatDay, namePeriod, periodUnit } from "@/lib/automation-rules";

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const formatMoment = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// The server's PLAYLISTS_KEPT: past it, a new playlist pushes out the oldest period. The shelf warns from WARN_FROM.
export const PLAYLISTS_KEPT = 50;
const WARN_FROM = 45;

/** What tells apart the playlists of one automation: the period they cover, or when they were made if that wasn't recorded. */
export function describeCoverage(playlist) {
  const { period_start: start, period_end: end, generated_at: generatedAt } = playlist;
  if (!end) return `Made ${formatMoment(generatedAt)}`;
  return start ? namePeriod({ start, end }) : `Up to ${formatDay(end)}`;
}

/** The dates under a period's name, or null when the name already is its dates. */
export function coverageDates({ start, end }) {
  if (!start || !end) return null;
  const dates = describePeriod({ start, end });
  return namePeriod({ start, end }).toLowerCase() === dates.toLowerCase() ? null : dates;
}

// A playlist's place on its shelf: the last day it covers, or the day it was made.
const lastDay = (item) => item.end ?? item.period_end ?? item.generated_at?.slice(0, 10) ?? "";

/** How full a shelf is: a warning from WARN_FROM, and how far its oldest playlist has burnt (0 to 1). */
export function shelfLoad(count) {
  if (count < WARN_FROM) return { warning: null, burn: 0 };
  return {
    warning: `${count} of ${PLAYLISTS_KEPT} playlists kept · The oldest period goes when a new one is made`,
    burn: Math.min(1, (count - WARN_FROM + 1) / (PLAYLISTS_KEPT - WARN_FROM + 1)),
  };
}

export const describeMade = (playlist) => `Made ${formatMoment(playlist.generated_at)}`;

/**
 * One shelf per automation, the most recently fed first (the list comes newest made first), then those with only
 * missing periods. On a shelf, playlists and missing periods (pastPeriods) go by period, the latest first.
 */
export function shelvesOf(playlists, automations, pastPeriods = []) {
  const byId = new Map(automations.map((automation) => [automation.id, automation]));
  const shelves = new Map();
  const shelfOf = (key, automation, fallbackName) => {
    if (!shelves.has(key)) {
      shelves.set(key, {
        key,
        name: automation?.name || fallbackName || "Untitled",
        cadence: !automation ? null : automation.enabled === false ? "Paused" : describeSchedule(automation.cron),
        unit: automation ? periodUnit(automation.cron) : "period",
        playlists: [],
        missing: [],
      });
    }
    return shelves.get(key);
  };
  for (const playlist of playlists) {
    shelfOf(playlist.automation_id ?? `name:${playlist.name}`, byId.get(playlist.automation_id), playlist.name).playlists.push(playlist);
  }
  for (const period of pastPeriods) {
    const automation = byId.get(period.automation_id);
    if (automation) shelfOf(period.automation_id, automation).missing.push(period);
  }
  const byPeriod = (a, b) => lastDay(b).localeCompare(lastDay(a));
  return [...shelves.values()].map((shelf) => {
    const playlistsByPeriod = [...shelf.playlists].sort(byPeriod);
    return { ...shelf, playlists: playlistsByPeriod, items: [...playlistsByPeriod, ...shelf.missing].sort(byPeriod), oldest: playlistsByPeriod.at(-1) ?? null };
  });
}

export const tracksAsText = (tracks) => tracks.map((track) => `${track.artist} - ${track.title}`).join("\n");
