const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
        "Unable to reach the server. Make sure the backend is running on port 8000."
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

export async function previewAutomation(automation) {
  requireUsername();
  return request("/api/automations/preview", {
    method: "POST",
    body: JSON.stringify({ automation }),
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


