import { SOURCE_TYPE_LABELS } from "./automation-rules";

const LAST_VISIT_KEY = "listfm_last_visit";

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatRelativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatFutureTime(iso) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

export function getLastVisit(username) {
  try {
    const data = JSON.parse(localStorage.getItem(LAST_VISIT_KEY) || "{}");
    return data[username] || null;
  } catch {
    return null;
  }
}

export function setLastVisit(username) {
  try {
    const data = JSON.parse(localStorage.getItem(LAST_VISIT_KEY) || "{}");
    data[username] = new Date().toISOString();
    localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function computeAutomationStats(automations) {
  const active = automations.filter((a) => a.enabled);
  const totalMatched = active.reduce((sum, a) => {
    const maxSize = a.output?.maxSize || 50;
    return sum + (a.lastRun ? maxSize : 0);
  }, 0);

  return {
    activeCount: active.length,
    totalCount: automations.length,
    totalMatched,
    lastRunLatest: active
      .map((a) => a.lastRun)
      .filter(Boolean)
      .sort()
      .pop() || null,
  };
}

export function computeNextRuns(automations) {
  const now = new Date();
  return automations
    .filter((a) => a.enabled && a.cron)
    .map((a) => {
      const next = estimateNextCron(a.cron, now);
      return { ...a, nextRun: next };
    })
    .sort((a, b) => {
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return new Date(a.nextRun) - new Date(b.nextRun);
    });
}

function estimateNextCron(cron, from) {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, day, month, weekday] = parts;
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);

  for (let i = 0; i < 366 * 24; i++) {
    next.setMinutes(next.getMinutes() + 1);
    if (!matchCronField(min, next.getMinutes())) continue;
    if (!matchCronField(hour, next.getHours())) continue;
    if (!matchCronField(day, next.getDate())) continue;
    if (!matchCronField(month, next.getMonth() + 1)) continue;
    if (!matchCronField(weekday, next.getDay())) continue;
    return next.toISOString();
  }
  return null;
}

function matchCronField(field, value) {
  if (field === "*") return true;
  if (field.includes("/")) {
    const [, step] = field.split("/");
    return value % parseInt(step) === 0;
  }
  if (field.includes(",")) {
    return field.split(",").some((v) => parseInt(v) === value);
  }
  if (field.includes("-")) {
    const [a, b] = field.split("-").map(Number);
    return value >= a && value <= b;
  }
  return parseInt(field) === value;
}

export function computeListeningPulse(tracks) {
  if (!tracks.length) return { topArtist: null, newArtists: [], diversity: 0 };

  const artistCounts = {};
  tracks.forEach((t) => {
    artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
  });

  const sorted = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);
  const topArtist = sorted[0] ? { name: sorted[0][0], plays: sorted[0][1] } : null;

  const totalTracks = tracks.length;
  const uniqueArtists = sorted.length;
  const diversity = Math.round((uniqueArtists / totalTracks) * 100);

  const mid = Math.floor(totalTracks / 2);
  const firstHalf = {};
  const secondHalf = {};
  tracks.slice(0, mid).forEach((t) => {
    firstHalf[t.artist] = (firstHalf[t.artist] || 0) + 1;
  });
  tracks.slice(mid).forEach((t) => {
    secondHalf[t.artist] = (secondHalf[t.artist] || 0) + 1;
  });

  const trend = computeTrend(firstHalf, secondHalf);

  return { topArtist, newArtists: sorted.slice(0, 3), diversity, trend };
}

function computeTrend(firstHalf, secondHalf) {
  const allArtists = new Set([...Object.keys(firstHalf), ...Object.keys(secondHalf)]);
  let rising = [];
  let falling = [];

  allArtists.forEach((artist) => {
    const before = firstHalf[artist] || 0;
    const after = secondHalf[artist] || 0;
    const diff = after - before;
    if (diff > 1) rising.push({ name: artist, diff });
    if (diff < -1) falling.push({ name: artist, diff: Math.abs(diff) });
  });

  rising.sort((a, b) => b.diff - a.diff);
  falling.sort((a, b) => b.diff - a.diff);

  return {
    rising: rising.slice(0, 2),
    falling: falling.slice(0, 2),
  };
}

export function getSourceLabel(type) {
  return SOURCE_TYPE_LABELS[type] || type;
}

export function countConditions(filterGroups) {
  if (!Array.isArray(filterGroups)) return 0;
  let count = 0;
  filterGroups.forEach((g) => {
    count += (g.conditions || []).length;
    if (g.groups) count += countConditions(g.groups);
  });
  return count;
}
