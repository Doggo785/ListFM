const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

let isRefreshing = false;
let refreshPromise = null;

// ── Module-level username cache ──────────────────────────────────────────────
let _username = null;

/**
 * Cache the current user's Last.fm username.
 * Called by AuthContext when user state changes.
 * @param {string|null} username
 */
export function setCurrentUsername(username) {
  _username = username;
}

/**
 * @returns {string|null} the cached Last.fm username
 */
export function getCurrentUsername() {
  return _username;
}

function requireUsername() {
  if (!_username) {
    throw new Error("No username available — user may not be authenticated");
  }
  return _username;
}

export async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401 && path !== "/api/auth/refresh" && !options._retried) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      }).finally(() => { isRefreshing = false; });
    }
    const refreshRes = await refreshPromise;
    if (refreshRes.ok) {
      return request(path, { ...options, _retried: true });
    }
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * @returns {Promise<object>} user info with image
 */
export async function getUserInfo() {
  const username = requireUsername();
  return request(`/api/${username}/info`);
}

/**
 * @param {number} limit — max tracks to return
 * @returns {Promise<{ tracks: Array }>}
 */
export async function getRecentTracks(limit = 50) {
  const username = requireUsername();
  return request(`/api/${username}/recent-tracks?limit=${limit}`);
}

/**
 * @param {object} automation — full automation object
 * @returns {{ tracks: Array, totalMatched: number }}
 */
export async function previewAutomation(automation) {
  const username = requireUsername();
  return request(`/api/automations/preview`, {
    method: "POST",
    body: JSON.stringify({ username, automation }),
  });
}

/**
 * @returns {Promise<Array>} list of automations
 */
export async function getAutomations() {
  const username = requireUsername();
  return request(`/api/${username}/automations`);
}

/**
 * @param {string} id — automation UUID
 * @returns {Promise<object>} automation
 */
export async function getAutomation(id) {
  const username = requireUsername();
  return request(`/api/${username}/automations/${id}`);
}

/**
 * @param {object} automation — automation data (name, source, filterGroups, etc.)
 * @returns {Promise<object>} created automation with id
 */
export async function createAutomation(automation) {
  const username = requireUsername();
  return request(`/api/${username}/automations`, {
    method: "POST",
    body: JSON.stringify(automation),
  });
}

/**
 * @param {string} id — automation UUID
 * @param {object} automation — partial automation data to update
 * @returns {Promise<object>} updated automation
 */
export async function updateAutomation(id, automation) {
  const username = requireUsername();
  return request(`/api/${username}/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(automation),
  });
}

/**
 * @param {string} id — automation UUID
 * @returns {Promise<void>}
 */
export async function deleteAutomation(id) {
  const username = requireUsername();
  return request(`/api/${username}/automations/${id}`, {
    method: "DELETE",
  });
}

/**
 * @param {object} playlist — { automation_id, name, source_type, source_period, tracks, track_count, filter_groups }
 * @returns {Promise<object>} saved playlist
 */
export async function saveGeneratedPlaylist(playlist) {
  const username = requireUsername();
  return request(`/api/${username}/generated-playlists`, {
    method: "POST",
    body: JSON.stringify(playlist),
  });
}

/**
 * @returns {Promise<Array>} list of generated playlists
 */
export async function getGeneratedPlaylists() {
  const username = requireUsername();
  return request(`/api/${username}/generated-playlists`);
}

/**
 * @param {string} id — playlist UUID
 * @returns {Promise<void>}
 */
export async function deleteGeneratedPlaylist(id) {
  const username = requireUsername();
  return request(`/api/${username}/generated-playlists/${id}`, {
    method: "DELETE",
  });
}
