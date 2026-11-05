import { describePeriod, describeSchedule, formatDay } from "@/lib/automation-rules";

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const formatMoment = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** What tells apart the playlists of one automation: the dates they cover, or when they were made if those weren't recorded. */
export function describeCoverage(playlist) {
  const { period_start: start, period_end: end, generated_at: generatedAt } = playlist;
  if (!end) return `Made ${formatMoment(generatedAt)}`;
  return start ? describePeriod({ start, end }) : `Up to ${formatDay(end)}`;
}

export const describeMade = (playlist) => `Made ${formatMoment(playlist.generated_at)}`;

/** One shelf per automation, the most recently fed first. The list comes newest first. */
export function shelvesOf(playlists, automations) {
  const byId = new Map(automations.map((automation) => [automation.id, automation]));
  const shelves = new Map();
  for (const playlist of playlists) {
    const key = playlist.automation_id ?? `name:${playlist.name}`;
    if (!shelves.has(key)) {
      const automation = byId.get(playlist.automation_id);
      shelves.set(key, {
        key,
        name: automation?.name || playlist.name || "Untitled",
        cadence: !automation ? null : automation.enabled === false ? "Paused" : describeSchedule(automation.cron),
        playlists: [],
      });
    }
    shelves.get(key).playlists.push(playlist);
  }
  return [...shelves.values()];
}

export const tracksAsText = (tracks) => tracks.map((track) => `${track.artist} - ${track.title}`).join("\n");
