import { plural } from "@/lib/playlists";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RUN_TONES = { plain: "text-(--text)", muted: "text-(--text-muted)", alert: "text-(--ember)" };

export const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** One line per run: the attempts of a chain share a scheduled date and count up. The list comes newest first. */
export function chainsOf(rows) {
  const chains = [];
  for (const row of [...rows].reverse()) {
    const last = chains.at(-1);
    if (row.attempt > 1 && last && last.head.scheduled_for === row.scheduled_for) {
      last.head = row;
      last.tries.unshift(row);
    } else {
      chains.push({ head: row, tries: [row] });
    }
  }
  return chains.reverse();
}

const failedLabel = (attempt) => (attempt > 1 ? `Failed after ${attempt} tries` : "Failed");

/** What a run came to, in words. A short or empty run is a result, not a failure. */
export function describeRun(run, now = new Date()) {
  if (run.status === "running") return { label: "Running", tone: "plain" };
  if (run.status === "waiting") return { label: "Waiting", tone: "muted" };
  if (run.status === "empty") return { label: "Empty · No track matched", tone: "muted" };
  if (run.status === "failed") {
    if (run.next_retry_at) {
      const late = new Date(run.next_retry_at) <= now;
      return { label: late ? "Retrying soon" : `Retrying at ${timeOf(run.next_retry_at)}`, tone: "alert" };
    }
    const label = failedLabel(run.attempt);
    return { label: run.retries_exhausted ? `${label} · No more automatic tries` : label, tone: "alert" };
  }
  const { tracks_generated: made, target_size: wanted } = run;
  const short = wanted != null && made < wanted;
  const count = short ? `${made}/${wanted} tracks` : plural(made, "track");
  return { label: run.attempt > 1 ? `${count} · On try ${run.attempt}` : count, tone: short ? "muted" : "plain" };
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function dayOf(iso, now = new Date()) {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Chains under the day their latest attempt started, keeping their order. */
export function daysOf(chains, now = new Date()) {
  const days = new Map();
  for (const chain of chains) {
    const day = dayOf(chain.head.started_at, now);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(chain);
  }
  return [...days].map(([day, list]) => ({ day, chains: list }));
}
