// ── Source types ─────────────────────────────────────────────────
export const SOURCE_TYPES = {
  TOP_TRACKS: "top_tracks",
  RECENT_TRACKS: "recent_tracks",
  LOVED_TRACKS: "loved_tracks",
  TOP_ARTISTS: "top_artists",
};

export const SOURCE_TYPE_LABELS = {
  top_tracks: "Top Tracks",
  recent_tracks: "Recent Tracks",
  loved_tracks: "Loved Tracks",
  top_artists: "Top Artists",
};

export const SOURCE_OPTIONS = [
  { type: SOURCE_TYPES.TOP_TRACKS, description: "Your most played tracks over the selected period" },
  { type: SOURCE_TYPES.RECENT_TRACKS, description: "Your most recent listens" },
  { type: SOURCE_TYPES.LOVED_TRACKS, description: "Your Last.fm loved tracks" },
  { type: SOURCE_TYPES.TOP_ARTISTS, description: "Tracks from your favorite artists" },
];

// ── Period options ────────────────────────────────────────────────
export const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "1m", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "overall", label: "All time" },
];

// ── Cron presets (simplified interface) ────────────────────────────
export const DEFAULT_CRON = "0 0 1 * *";

export const CRON_PRESETS = [
  { label: "Every day", cron: "0 8 * * *", description: "Daily at 8:00 AM" },
  { label: "Every week (Monday)", cron: "0 8 * * 1", description: "Weekly on Monday at 8:00 AM" },
  { label: "Every 2 weeks", cron: "0 8 * * 1/2", description: "Every 2 weeks on Monday at 8:00 AM" },
  { label: "Every month (1st)", cron: "0 0 1 * *", description: "Monthly on the 1st at midnight" },
  { label: "Every 3 months", cron: "0 0 1 */3 *", description: "Every 3 months on the 1st at midnight" },
  { label: "Every year (Jan 1st)", cron: "0 0 1 1 *", description: "Yearly on January 1st at midnight" },
];

export const CRON_PLACEHOLDER = "min hour day month weekday";

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

// ── Filter fields ────────────────────────────────────────────────
export const FILTER_FIELDS = {
  userplaycount: { label: "Your plays (all time)", type: "number", description: "Total times you played this track across all time" },
  userloved: { label: "Loved", type: "boolean", description: "Whether you've loved this track on Last.fm" },
  playcount: { label: "Your plays (period)", type: "number", description: "Times you played this track within the selected period" },
  global_playcount: { label: "Global plays", type: "number", description: "Total plays across all Last.fm users" },
  listeners: { label: "Listeners", type: "number", description: "Number of unique Last.fm users who played this track" },
  rank: { label: "Rank", type: "number", description: "Position in your top tracks chart (1 = #1)" },
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

// ── Default form ─────────────────────────────────────────────────
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
    source: {
      type: SOURCE_TYPES.RECENT_TRACKS,
      period: "3m",
    },
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

// ── Validation helpers ───────────────────────────────────────────
export function sanitizeAutomation(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id || !raw.source) return null;

  return {
    id: raw.id,
    name: String(raw.name || ""),
    description: String(raw.description || ""),
    source: {
      type: Object.values(SOURCE_TYPES).includes(raw.source.type)
        ? raw.source.type
        : SOURCE_TYPES.RECENT_TRACKS,
      period: PERIOD_OPTIONS.some((p) => p.value === raw.source.period)
        ? raw.source.period
        : "3m",
    },
    cron: isValidCron(raw.cron) ? raw.cron.trim() : "",
    filterGroups: Array.isArray(raw.filterGroups)
      ? raw.filterGroups
      : [createGroup()],
    output: {
      maxSize: Math.max(1, parseInt(raw.output?.maxSize) || 50),
    },
    enabled: raw.enabled !== false,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    lastRun: raw.lastRun || null,
  };
}

export function loadAutomationsFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeAutomation).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveAutomationsToStorage(automations) {
  localStorage.setItem("listfm_automations", JSON.stringify(automations));
}
