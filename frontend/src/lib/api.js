// Same-origin by default: dev requests go through the Vite /api proxy,
// so cookies never cross origins. Set VITE_API_URL only for builds that
// are served from a different origin than the API.
const API_BASE = import.meta.env.VITE_API_URL || "";

let isRefreshing = false;
let refreshPromise = null;

let _username = null;

/**
 * Cache the current user's Last.fm username.
 * Called by AuthContext when user state changes.
 * @param {string|null} username
 */
export function setCurrentUsername(username) {
  _username = username;
}

function requireUsername() {
  if (!_username) {
    throw new Error("No username available — user may not be authenticated");
  }
  return _username;
}

export async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      throw new Error(
        "Unable to reach the server. Make sure the backend is running."
      );
    }
    throw err;
  }
  if (res.status === 401 && path !== "/api/auth/refresh" && !options._retried) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      }).finally(() => { isRefreshing = false; });
    }
    try {
      const refreshRes = await refreshPromise;
      if (refreshRes.ok) {
        return request(path, { ...options, _retried: true });
      }
    } catch {
      // Refresh failed (network error, etc.) — fall through to original 401
    }
  }
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        message = parsed.detail ?? parsed.error ?? body;
      }
    } catch {
      // body is not JSON — fall back to raw text
    }
    throw new Error(`API ${res.status}: ${message}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getUserInfo() {
  requireUsername();
  return request("/api/info");
}

export async function getRecentTracks(limit = 50) {
  requireUsername();
  return request(`/api/recent-tracks?limit=${limit}`);
}

export async function previewAutomation(automation, progressToken) {
  requireUsername();
  return request("/api/automations/preview", {
    method: "POST",
    body: JSON.stringify(
      progressToken ? { automation, progress_token: progressToken } : { automation }
    ),
  });
}

export async function getAutomations() {
  requireUsername();
  return request("/api/automations");
}

export async function getAutomation(id) {
  requireUsername();
  return request(`/api/automations/${id}`);
}

export async function createAutomation(automation) {
  requireUsername();
  return request("/api/automations", {
    method: "POST",
    body: JSON.stringify(automation),
  });
}

export async function updateAutomation(id, automation) {
  requireUsername();
  return request(`/api/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(automation),
  });
}

export async function deleteAutomation(id) {
  requireUsername();
  return request(`/api/automations/${id}`, {
    method: "DELETE",
  });
}

export async function getAutomationHistory(id) {
  requireUsername();
  return request(`/api/automations/${id}/history`);
}

export async function runAutomationNow(id, progressToken) {
  requireUsername();
  return request(`/api/automations/${id}/run`, {
    method: "POST",
    ...(progressToken ? { body: JSON.stringify({ progress_token: progressToken }) } : {}),
  });
}

export async function getGeneratedPlaylistTracks(playlistId) {
  requireUsername();
  return request(`/api/generated-playlists/${playlistId}/tracks`);
}

export async function getGeneratedPlaylists() {
  requireUsername();
  return request("/api/generated-playlists");
}

export async function getGeneratedPlaylist(id) {
  requireUsername();
  return request(`/api/generated-playlists/${id}`);
}

export async function saveGeneratedPlaylist(playlist) {
  requireUsername();
  return request("/api/generated-playlists", {
    method: "POST",
    body: JSON.stringify(playlist),
  });
}

let progressTokenCounter = 0;

export function newProgressToken() {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  // Last resort without WebCrypto (practically unreachable in supported
  // browsers): unique per session via a counter, good enough for a
  // short-lived progress ticket behind auth. No Math.random: it is not
  // a safe random source (flags security scanners).
  progressTokenCounter += 1;
  return `preview-${Date.now().toString(36)}-${progressTokenCounter}`;
}

export async function getPreviewProgress(token) {
  requireUsername();
  return request(`/api/automations/preview-progress/${token}`);
}

export async function cancelPreview(token) {
  requireUsername();
  return request(`/api/automations/preview-progress/${token}`, {
    method: "DELETE",
  });
}

export async function getRunProgress(id, token) {
  requireUsername();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return request(`/api/automations/${id}/run-progress${query}`);
}

const TERMINAL_STAGES = new Set(["done", "error", "cancelled"]);

export async function pollProgress(
  getSnapshot,
  {
    intervalMs = 2000,
    timeoutMs = 10 * 60 * 1000,
    notFoundGraceMs = 15000,
    onUpdate,
    shouldStop,
  } = {}
) {
  const started = Date.now();
  let snapshot = { stage: "queued", done: 0, total: 0 };
  for (;;) {
    if (shouldStop && shouldStop()) return snapshot;
    try {
      snapshot = await getSnapshot();
    } catch (err) {
      // The ticket may not exist yet: the poll often fires before the POST
      // created it server-side. Treat 404 as "queued" for a grace period.
      const notFound = err instanceof Error && /API 404/.test(err.message);
      if (notFound && Date.now() - started < notFoundGraceMs) {
        snapshot = { stage: "queued", done: 0, total: 0 };
        if (onUpdate) onUpdate(snapshot);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      throw err;
    }
    if (onUpdate) onUpdate(snapshot);
    if (TERMINAL_STAGES.has(snapshot.stage)) return snapshot;
    if (Date.now() - started > timeoutMs) {
      const err = new Error(
        "Still running after 10 minutes. It continues in the background — check the run history."
      );
      err.code = "PROGRESS_TIMEOUT";
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}


