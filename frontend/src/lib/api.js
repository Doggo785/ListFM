const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Get user info (avatar, profile) from Last.fm.
 * @param {string} username
 * @returns {Promise<object>} user info with image
 */
export async function getUserInfo(username) {
  return request(`/api/${username}/info`);
}

/**
 * Get recently played tracks for a user.
 * @param {string} username
 * @param {number} limit — max tracks to return
 * @returns {Promise<{ tracks: Array }>}
 */
export async function getRecentTracks(username, limit = 50) {
  return request(`/api/${username}/recent-tracks?limit=${limit}`);
}

/**
 * Generate a preview playlist from an automation rule.
 * @param {string} username
 * @param {object} automation — full automation object
 * @returns {{ tracks: Array, totalMatched: number }}
 */
export async function previewAutomation(username, automation) {
  return request(`/api/automations/preview`, {
    method: "POST",
    body: JSON.stringify({ username, automation }),
  });
}

/**
 * List all automations for a user.
 * @param {string} username
 * @returns {Promise<Array>} list of automations
 */
export async function getAutomations(username) {
  return request(`/api/${username}/automations`);
}

/**
 * Get a single automation by ID.
 * @param {string} username
 * @param {string} id — automation UUID
 * @returns {Promise<object>} automation
 */
export async function getAutomation(username, id) {
  return request(`/api/${username}/automations/${id}`);
}

/**
 * Create a new automation.
 * @param {string} username
 * @param {object} automation — automation data (name, source, filterGroups, etc.)
 * @returns {Promise<object>} created automation with id
 */
export async function createAutomation(username, automation) {
  return request(`/api/${username}/automations`, {
    method: "POST",
    body: JSON.stringify(automation),
  });
}

/**
 * Update an existing automation.
 * @param {string} username
 * @param {string} id — automation UUID
 * @param {object} automation — partial automation data to update
 * @returns {Promise<object>} updated automation
 */
export async function updateAutomation(username, id, automation) {
  return request(`/api/${username}/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(automation),
  });
}

/**
 * Delete an automation.
 * @param {string} username
 * @param {string} id — automation UUID
 * @returns {Promise<void>}
 */
export async function deleteAutomation(username, id) {
  return request(`/api/${username}/automations/${id}`, {
    method: "DELETE",
  });
}

/**
 * Save a generated playlist to library.
 * @param {string} username
 * @param {object} playlist — { automation_id, name, source_type, source_period, tracks, track_count, filter_groups }
 * @returns {Promise<object>} saved playlist
 */
export async function saveGeneratedPlaylist(username, playlist) {
  return request(`/api/${username}/generated-playlists`, {
    method: "POST",
    body: JSON.stringify(playlist),
  });
}

/**
 * List all generated playlists for a user.
 * @param {string} username
 * @returns {Promise<Array>} list of generated playlists
 */
export async function getGeneratedPlaylists(username) {
  return request(`/api/${username}/generated-playlists`);
}

/**
 * Delete a generated playlist.
 * @param {string} username
 * @param {string} id — playlist UUID
 * @returns {Promise<void>}
 */
export async function deleteGeneratedPlaylist(username, id) {
  return request(`/api/${username}/generated-playlists/${id}`, {
    method: "DELETE",
  });
}
