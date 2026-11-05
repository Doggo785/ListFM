import {
  IconArrowsShuffle,
  IconBolt,
  IconClock,
  IconDice5,
  IconSparkles,
} from "@tabler/icons-react";

// GLOSSARY: Tri. Values mirror backend schemas.SortKey.
export const SORT_OPTIONS = [
  { value: "most_played", label: "Most played", icon: IconBolt, description: "Your most played tracks in the window" },
  { value: "last_played", label: "Recently played", icon: IconClock, description: "What you listened to last" },
  { value: "first_played", label: "Recently discovered", icon: IconSparkles, description: "Tracks you heard for the first time most recently" },
  { value: "random", label: "Random", icon: IconArrowsShuffle, description: "A fresh draw every run" },
  { value: "random_weighted", label: "Random, favorites first", icon: IconDice5, description: "A draw that favors what you play most" },
];

const month = (amount) => ({ length: { amount, unit: "month" }, ago: null });

// GLOSSARY: Fenêtre. Counted back from the run's scheduled time.
export const WINDOW_OPTIONS = [
  { value: "7d", label: "Last 7 days", window: { length: { amount: 7, unit: "day" }, ago: null } },
  { value: "1m", label: "Last month", window: month(1) },
  { value: "3m", label: "Last 3 months", window: month(3) },
  { value: "6m", label: "Last 6 months", window: month(6) },
  { value: "12m", label: "Last 12 months", window: month(12) },
  {
    value: "year_ago",
    label: "Same month, a year ago",
    window: { length: { amount: 1, unit: "month" }, ago: { amount: 1, unit: "year" } },
  },
  { value: "all", label: "All time", window: { length: null, ago: null } },
];

const sameSpan = (a, b) => (a ?? null) === (b ?? null) || (a?.amount === b?.amount && a?.unit === b?.unit);

export function windowOption(window) {
  return WINDOW_OPTIONS.find(
    (o) => sameSpan(o.window.length, window?.length) && sameSpan(o.window.ago, window?.ago),
  );
}

/** Summary with the schedule first when there is one (dashboard cards). */
export function describeAutomationWithSchedule(auto) {
  const summary = describeAutomation(auto);
  return isValidCron(auto?.cron) ? `${describeCron(auto.cron)} · ${summary}` : summary;
}

/** One-line summary of an automation, e.g. "Most played · Last 3 months". */
export function describeAutomation(auto) {
  const sort = SORT_OPTIONS.find((o) => o.value === auto?.sort)?.label ?? auto?.sort;
  return `${sort} · ${windowOption(auto?.window)?.label ?? "Custom window"}`;
}

export const DEFAULT_CRON = "0 0 1 * *";

const CRON_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

// Same reading as the server for numbers. Named values (`mon`, `last`) stay the server's to judge.
function isValidCronField(field, [min, max]) {
  const inRange = (n) => n === undefined || (Number(n) >= min && Number(n) <= max);
  return field.split(",").every((piece) => {
    const match = /^(?:\*|[a-z]+(?:-[a-z]+)?|(\d+)(?:-(\d+))?)(?:\/([1-9]\d*))?$/i.exec(piece);
    return match !== null && inRange(match[1]) && inRange(match[2]);
  });
}

export function isValidCron(expr) {
  if (!expr || typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 && parts.every((part, i) => isValidCronField(part, CRON_RANGES[i]));
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const isWhole = (part) => /^\d+$/.test(part);
// Each fire closes a whole season: December to February on 1 March, and so on.
const SEASON_MONTHS = "3,6,9,12";

/** A cron as what the schedule picker edits. Anything the picker can't draw is "custom". */
export function readSchedule(expr) {
  if (!expr) return { frequency: "none" };
  if (!isValidCron(expr)) return { frequency: "custom" };
  const [minute, hour, day, month, weekday] = expr.trim().split(/\s+/);
  if (!isWhole(minute) || !isWhole(hour)) return { frequency: "custom" };
  const time = { minute: Number(minute), hour: Number(hour) };
  if (day === "*" && month === "*") {
    if (weekday === "*") return { frequency: "daily", ...time };
    if (isWhole(weekday)) return { frequency: "weekly", ...time, weekday: Number(weekday) % 7 };
  }
  // The picker stops at the 28th, the last day every month has.
  if (isWhole(day) && Number(day) <= 28 && weekday === "*") {
    const dated = { ...time, day: Number(day) };
    if (month === "*") return { frequency: "monthly", ...dated };
    if (month === "*/3") return { frequency: "quarterly", ...dated };
    if (month === SEASON_MONTHS) return { frequency: "seasonal", ...dated };
    if (isWhole(month)) return { frequency: "yearly", ...dated, month: Number(month) };
  }
  return { frequency: "custom" };
}

export function writeSchedule({ frequency, minute = 0, hour = 8, weekday = 1, day = 1, month = 1 }) {
  const time = `${minute} ${hour}`;
  if (frequency === "daily") return `${time} * * *`;
  if (frequency === "weekly") return `${time} * * ${weekday}`;
  if (frequency === "monthly") return `${time} ${day} * *`;
  if (frequency === "quarterly") return `${time} ${day} */3 *`;
  if (frequency === "seasonal") return `${time} ${day} ${SEASON_MONTHS} *`;
  if (frequency === "yearly") return `${time} ${day} ${month} *`;
  return "";
}

const formatDay = (day, withYear = true) =>
  new Date(`${day}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear && { year: "numeric" }) });

/** The dates a run covers, as the preview returned them. */
export function describePeriod(period) {
  if (!period) return null;
  if (!period.start) return `all your listens up to ${formatDay(period.end)}`;
  return `${formatDay(period.start, period.start.slice(0, 4) !== period.end.slice(0, 4))} to ${formatDay(period.end)}`;
}

/** The two ways to start, before the preview has answered too. */
export function describeOutcome(cron, { period, next_run: nextRun } = {}) {
  if (!cron) return "Nothing runs until you start it.";
  const next = nextRun ? formatDay(nextRun) : "the next date";
  return `Create and run makes ${describePeriod(period) ?? "the last full period"} now. Create only starts on ${next}.`;
}

/** Said on arrival after Create only. */
export function describeWaiting(cron, { next_run: nextRun } = {}) {
  if (!cron) return "Nothing runs until you start it.";
  return `First playlist on ${nextRun ? formatDay(nextRun) : "the next date"}.`;
}

const ordinal = (n) => {
  const v = n % 100;
  return `${n}${SUFFIXES[(v - 20) % 10] || SUFFIXES[v] || SUFFIXES[0]}`;
};
const SUFFIXES = ["th", "st", "nd", "rd"];

export function describeCron(expr) {
  if (!isValidCron(expr)) return null;
  const s = readSchedule(expr);
  if (s.frequency === "custom") return expr;
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  if (s.frequency === "daily") return `Every day at ${time}`;
  if (s.frequency === "weekly") return `Every ${WEEKDAYS[s.weekday]} at ${time}`;
  if (s.frequency === "monthly") return `The ${ordinal(s.day)} of every month at ${time}`;
  if (s.frequency === "quarterly") return `Every 3 months, on the ${ordinal(s.day)}, at ${time}`;
  if (s.frequency === "seasonal") return `The ${ordinal(s.day)} of March, June, September and December at ${time}`;
  return `Every year, ${MONTHS[s.month - 1]} ${ordinal(s.day)}, at ${time}`;
}

// Hints mirror services/filter_engine.py and the pipeline: reword them if the rule changes.
export const FILTER_FIELDS = {
  userplaycount: { label: "Your plays (all time)", type: "number", hint: "How many times you played the track, across all your listens." },
  playcount: { label: "Your plays (window)", type: "number", hint: "How many times you played the track inside the window." },
  userloved: { label: "Loved or not", type: "boolean", hint: "Whether you loved the track on Last.fm." },
  tags: { label: "Tag", type: "text", hint: "Tags come from the artist. Strength is how much Last.fm ties the tag to them: their top tag is 100, so a higher minimum keeps fewer artists. Artists whose tags aren't fetched yet never match." },
  timestamp: { label: "Last listen", type: "date", hint: "The last time you played the track inside the window, counted back from the day the playlist is made." },
  first_played: { label: "First listen", type: "date", hint: "The very first time you played the track, counted back from the day the playlist is made." },
  artist_rank: { label: "Top artists", type: "rank", hint: "The artist's place among those you played most over this period. Artists outside that ranking don't match." },
  listening_moment: { label: "Listening moment", type: "moment", hint: "How many times you played the track at that moment, in your timezone. A night past midnight belongs to the day it began." },
};

export const FILTER_OPERATORS = {
  number: [
    { value: "gte", label: "at least" },
    { value: "lte", label: "at most" },
    { value: "eq", label: "exactly" },
    { value: "between", label: "between" },
  ],
  text: [
    { value: "contains", label: "has" },
    { value: "not_contains", label: "doesn't have" },
  ],
  date: [
    { value: "within_days", label: "less than" },
    { value: "before", label: "more than" },
  ],
  boolean: [
    { value: "is", label: "is" },
  ],
  rank: [
    { value: "lte", label: "in my top" },
    { value: "gte", label: "from rank" },
    { value: "between", label: "ranked between" },
  ],
  moment: [
    { value: "gte", label: "at least" },
    { value: "lte", label: "at most" },
  ],
};

const DEFAULT_MOMENT = { fromDay: null, toDay: null, fromHour: 18, toHour: 23 };

/** A moment the server accepts: ranges stay whole, and "any day, any hour" means every day. */
export function completeMoment(moment) {
  const m = { ...moment };
  if (m.fromDay == null) m.toDay = null;
  else m.toDay ??= m.fromDay;
  if (m.fromHour == null) m.toHour = null;
  else if (m.toHour == null || m.toHour === m.fromHour) m.toHour = (m.fromHour + 1) % 24;
  if (m.fromDay == null && m.fromHour == null) return { ...m, fromDay: 1, toDay: 7 };
  return m;
}

export function createGroup(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    logic: "AND",
    conditions: [],
    groups: [],
    ...overrides,
  };
}

export function createCondition(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    field: "userplaycount",
    operator: "gte",
    value: "",
    valueMax: null,
    countMin: 0,
    tagSource: "artist",
    ...overrides,
  };
}

/** A copy with its own ids: the server keys per-rule results on them. */
export const cloneCondition = (condition) => ({ ...condition, id: crypto.randomUUID() });
export const cloneGroup = (group) => ({
  ...group,
  id: crypto.randomUUID(),
  conditions: group.conditions.map(cloneCondition),
  groups: (group.groups ?? []).map(cloneGroup),
});

/** The same condition on another field: the old value means nothing there. */
export function conditionForField(condition, field) {
  const type = FILTER_FIELDS[field]?.type ?? "number";
  return {
    ...condition,
    field,
    operator: FILTER_OPERATORS[type][0].value,
    value: { boolean: true, rank: 10, moment: 1 }[type] ?? "",
    valueMax: null,
    countMin: 0,
    period: null,
    moment: type === "moment" ? DEFAULT_MOMENT : null,
  };
}

// Same rule as the server (services/filter_engine.py): without its value a condition is ignored.
export function isCompleteCondition({ operator, value, valueMax }) {
  if (value == null || String(value).trim() === "") return false;
  return operator !== "between" || (valueMax != null && valueMax !== "");
}

function countConditions(filterGroups, test) {
  let count = 0;
  for (const group of filterGroups ?? []) {
    count += (group.conditions ?? []).filter(test).length;
    count += countConditions(group.groups, test);
  }
  return count;
}

export const countActiveConditions = (filterGroups) => countConditions(filterGroups, isCompleteCondition);
export const countIncompleteConditions = (filterGroups) => countConditions(filterGroups, (c) => !isCompleteCondition(c));

export function usesMomentFilter(filterGroups) {
  return (filterGroups ?? []).some(
    (group) => (group.conditions ?? []).some((c) => c.field === "listening_moment") || usesMomentFilter(group.groups),
  );
}

export function usesTagFilter(filterGroups) {
  return (filterGroups ?? []).some(
    (group) =>
      (group.conditions ?? []).some((c) => c.field === "tags" && isCompleteCondition(c)) ||
      usesTagFilter(group.groups),
  );
}

const rule = (field, operator, value) => ({ field, operator, value });

// GLOSSARY: Preset. A filled-in recipe to start from, everything stays editable.
export const PRESETS = [
  { id: "top", description: "What you played most over the last 3 months.", label: "Top tracks", window: month(3), sort: "most_played", cron: "", maxSize: 50, rules: [] },
  { id: "recent", description: "What you listened to last, over the last month.", label: "Recent", window: month(1), sort: "last_played", cron: "", maxSize: 50, rules: [] },
  { id: "loved", description: "The tracks you loved on Last.fm, latest listens first.", label: "Loved", window: { length: null, ago: null }, sort: "last_played", cron: "", maxSize: 50, rules: [rule("userloved", "is", true)] },
  { id: "artists", description: "Your 10 most played artists of the last 3 months, 5 tracks each at most.", label: "Top artists", window: month(3), sort: "most_played", cron: "", maxSize: 50, maxPerArtist: 5, rules: [rule("artist_rank", "lte", 10)] },
  { id: "discoveries", description: "On the 1st of each month, the tracks you first heard in the month before.", label: "Monthly discoveries", window: month(1), sort: "most_played", cron: DEFAULT_CRON, maxSize: 50, rules: [rule("first_played", "within_days", 31)] },
  { id: "rediscoveries", description: "Tracks you played 5 times or more, but not in the last 6 months.", label: "Rediscoveries", window: { length: null, ago: null }, sort: "most_played", cron: "", maxSize: 50, rules: [rule("timestamp", "before", 180), rule("userplaycount", "gte", 5)] },
  { id: "seasonal", description: "At each change of season, what you played most during the one that ended.", label: "Seasonal", window: month(3), sort: "most_played", cron: `0 0 1 ${SEASON_MONTHS} *`, maxSize: 30, rules: [] },
];

/** The preset's recipe over a draft: name and identity stay the draft's. */
export function applyPreset(draft, preset) {
  return {
    ...draft,
    window: preset.window,
    sort: preset.sort,
    sortCounts: "window",
    cron: preset.cron,
    filterGroups: [createGroup({ conditions: preset.rules.map((r) => createCondition(r)) })],
    output: { maxSize: preset.maxSize, ...(preset.maxPerArtist && { maxPerArtist: preset.maxPerArtist }) },
  };
}

function stripIds(groups) {
  return (groups ?? []).map((g) => ({
    logic: g.logic,
    conditions: g.conditions.map((c) => ({ ...c, id: undefined })),
    groups: stripIds(g.groups),
  }));
}

const recipe = (a) =>
  JSON.stringify([
    a.window,
    a.sort,
    a.sortCounts ?? "window",
    a.cron,
    stripIds(a.filterGroups),
    a.output?.maxSize,
    a.output?.maxPerArtist ?? null,
    a.output?.maxPerAlbum ?? null,
    a.output?.noRepeatPlaylists ?? null,
  ]);

export function matchingPreset(draft) {
  return PRESETS.find((preset) => recipe(applyPreset(draft, preset)) === recipe(draft));
}

/** The name offered until the user types their own. */
export function suggestName(draft) {
  return matchingPreset(draft)?.label ?? describeAutomation(draft);
}

/** What the API accepts from a draft: fields left blank mid-edit fall back to their default. */
export function toPayload(draft) {
  const { length, ago } = draft.window;
  return {
    ...draft,
    window: {
      length: length && { ...length, amount: length.amount ?? 1 },
      ago: ago?.amount ? ago : null,
    },
    output: { ...draft.output, maxSize: draft.output.maxSize ?? 50 },
  };
}

export function createDefaultAutomation() {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    window: month(3),
    sort: "most_played",
    cron: "",
    filterGroups: [createGroup()],
    output: {
      maxSize: 50,
    },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRun: null,
  };
}
