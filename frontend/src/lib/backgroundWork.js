/**
 * The background work the ribbon shows: where its front is, and how long is left. Maths and words only.
 * BackgroundTasks puts it on ribbonStage.work at each status read; the ribbon glides it between two reads.
 */

const MAX_AHEAD_SECONDS = 6; // Two missed reads at most: past that the front waits for news rather than guess.
const OLD_YEARS_SHARE = 0.4; // Of the band, while a first import still reads the years before the one shown.
const DAY_MS = 24 * 60 * 60 * 1000;

/** "about 6 min left", from the server's estimate. Null while it cannot tell yet. */
export function timeLeft(seconds) {
  if (seconds == null) return null;
  if (seconds < 60) return "under a minute left";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  const rest = minutes % 60;
  return `about ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""} left`;
}

/**
 * The work as the ribbon reads it, from a task and the work it replaces: the share done, how fast it moves,
 * and for a history being read the dates it spans. The date's speed is measured between two reads that moved it.
 */
export function workFrom(task, previous, now) {
  const since = task.since ? Date.parse(task.since) : null;
  const until = task.until ? Date.parse(task.until) : null;
  const same = previous?.kind === task.kind;
  const moved = same && until != null && previous.until != null && until !== previous.until;
  return {
    kind: task.kind,
    share: task.share,
    perSecond: task.eta ? (1 - task.share) / task.eta : 0,
    at: now,
    since,
    until,
    untilAt: moved || !same ? now : previous.untilAt,
    untilPerSecond: moved ? Math.max(0, (until - previous.until) / Math.max(1, (now - previous.untilAt) / 1000)) : same ? previous.untilPerSecond : 0,
    doneAt: null,
  };
}

/** Where the front should be at `now`: the last read moved on at the pace measured, never past what it can guess. */
export function frontAt(work, now) {
  const ahead = Math.min(Math.max(0, now - work.at) / 1000, MAX_AHEAD_SECONDS);
  const share = work.doneAt == null ? Math.min(1, work.share + work.perSecond * ahead) : 1;
  if (work.until == null) return { share, until: null };
  const untilAhead = Math.min(Math.max(0, now - work.untilAt) / 1000, MAX_AHEAD_SECONDS);
  return { share, until: work.until + work.untilPerSecond * untilAhead };
}

/** The first instant of the month `back` months before the one holding `ms`, in local time. */
export function monthStart(ms, back = 0) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth() - back, 1).getTime();
}

/** Months from the start of `origin`'s month to `ms`, with the fraction of the month reached. */
export function monthsSince(origin, ms) {
  const from = new Date(origin);
  const to = new Date(ms);
  const days = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  const inMonth = (ms - new Date(to.getFullYear(), to.getMonth(), 1).getTime()) / (days * DAY_MS);
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + inMonth;
}

/**
 * The band of a first import, oldest on the left: the years before the one shown as a low line on its first part,
 * then the year itself, one twelfth of the rest per month, starting at `origin` (its first month on screen).
 * Returns where that year starts and where the date `until` lies, in pixels.
 */
export function historyBand({ since, until, yearStart, origin, width }) {
  const yearX = since != null && since < yearStart ? OLD_YEARS_SHARE * width : 0;
  const perMonth = (width - yearX) / 12;
  if (until == null) return { yearX, perMonth, frontX: 0 };
  const frontX = until < yearStart ? (yearX * (until - since)) / Math.max(1, yearStart - since) : yearX + monthsSince(origin, until) * perMonth;
  return { yearX, perMonth, frontX: Math.min(width, Math.max(0, frontX)) };
}
