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
