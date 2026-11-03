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

export const CRON_PRESETS = [
  { label: "Every day", cron: "0 8 * * *", description: "Daily at 8:00 AM" },
  { label: "Every week (Monday)", cron: "0 8 * * 1", description: "Weekly on Monday at 8:00 AM" },
  { label: "Every 2 weeks", cron: "0 8 * * 1/2", description: "Every 2 weeks on Monday at 8:00 AM" },
  { label: "Every month (1st)", cron: "0 0 1 * *", description: "Monthly on the 1st at midnight" },
  { label: "Every 3 months", cron: "0 0 1 */3 *", description: "Every 3 months on the 1st at midnight" },
  { label: "Every year (Jan 1st)", cron: "0 0 1 1 *", description: "Yearly on January 1st at midnight" },
];

export function isValidCron(expr) {
  if (!expr || typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function describeCron(expr) {
  if (!isValidCron(expr)) return null;
  const [min, hour, day, month, weekday] = expr.trim().split(/\s+/);

  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;

  if (weekday !== "*" && day === "*" && month === "*") {
    const dayName = WEEKDAY_NAMES[parseInt(weekday)] || weekday;
    return `Every ${dayName} at ${time}`;
  }
  if (day !== "*" && month === "*" && weekday === "*") {
    return `Every ${day}${nthSuffix(day)} at ${time}`;
  }
  if (month !== "*" && day === "*" && weekday === "*") {
    const monthName = MONTH_NAMES[parseInt(month)] || month;
    return `Every ${monthName} at ${time}`;
  }
  if (month !== "*" && day !== "*" && weekday === "*") {
    const monthName = MONTH_NAMES[parseInt(month)] || month;
    return `${monthName} ${day}${nthSuffix(day)} at ${time}`;
  }

  return expr;
}

const SUFFIXES = ["th", "st", "nd", "rd"];

function nthSuffix(n) {
  const v = parseInt(n) % 100;
  return SUFFIXES[(v - 20) % 10] || SUFFIXES[v] || SUFFIXES[0];
}

export const FILTER_FIELDS = {
  userplaycount: { label: "Your plays (all time)", type: "number", description: "Total times you played this track across all time" },
  userloved: { label: "Loved", type: "boolean", description: "Whether you've loved this track on Last.fm" },
  playcount: { label: "Your plays (window)", type: "number", description: "Times you played this track within the time window" },
  global_playcount: { label: "Global plays", type: "number", description: "Total plays across all Last.fm users" },
  listeners: { label: "Listeners", type: "number", description: "Number of unique Last.fm users who played this track" },
  rank: { label: "Rank", type: "number", description: "Position after sorting (1 = first)" },
  tags: { label: "Tag", type: "text", description: "Genre or mood tag associated with the track" },
  timestamp: { label: "Last listened", type: "date", description: "When you last played this track (in days ago)" },
};

export const FILTER_OPERATORS = {
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "between", label: "between" },
  ],
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "not contains" },
    { value: "eq", label: "equals" },
  ],
  date: [
    { value: "within_days", label: "Less than X days ago" },
    { value: "before", label: "More than X days ago" },
  ],
  boolean: [
    { value: "is", label: "is" },
  ],
};

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
    value: 0,
    valueMax: null,
    countMin: 0,
    tagSource: "artist",
    ...overrides,
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
