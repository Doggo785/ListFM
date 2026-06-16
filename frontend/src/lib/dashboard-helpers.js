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
  } catch {
    // localStorage quota exceeded or parse error — ignore
  }
}
