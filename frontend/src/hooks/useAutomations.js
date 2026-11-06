import { useCallback, useEffect, useState } from "react";
import { getAutomations, getGeneratedPlaylists } from "@/lib/api";

export function countByAutomation(generatedPlaylists = []) {
  const counts = new Map();
  for (const playlist of generatedPlaylists) {
    const key = playlist.automation_id;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// The last lists read, per account: coming back to a page shows them at once and refreshes behind.
let seen = null;

/** A deleted playlist must not come back from the lists kept in memory. */
export function forgetPlaylist(id) {
  if (!seen) return;
  seen = { ...seen, generatedPlaylists: seen.generatedPlaylists.filter((playlist) => playlist.id !== id) };
}

const NOTHING = [];
const NO_COUNTS = new Map();

export function useAutomations(username) {
  const kept = username && seen?.username === username ? seen : null;
  const [automations, setAutomations] = useState(kept?.automations ?? []);
  const [generatedPlaylists, setGeneratedPlaylists] = useState(kept?.generatedPlaylists ?? []);
  const [counts, setCounts] = useState(() => countByAutomation(kept?.generatedPlaylists));
  // Whose lists are on screen: loading is having none yet for this name.
  const [loadedFor, setLoadedFor] = useState(kept ? username : null);
  const [error, setError] = useState(null);
  const [playlistsFailed, setPlaylistsFailed] = useState(false);
  const isLoading = Boolean(username) && loadedFor !== username;

  const load = useCallback(
    () => Promise.allSettled([getAutomations(), getGeneratedPlaylists()])
      .then(([autosResult, generatedResult]) => {
        if (autosResult.status === "rejected") {
          throw autosResult.reason;
        }
        const autoList =
          Array.isArray(autosResult.value) ? autosResult.value : [];
        const generatedList =
          generatedResult.status === "fulfilled" &&
          Array.isArray(generatedResult.value)
            ? generatedResult.value
            : [];
        const generatedFailed = generatedResult.status === "rejected";
        if (!generatedFailed) seen = { username, automations: autoList, generatedPlaylists: generatedList };
        setPlaylistsFailed(generatedFailed);
        setAutomations(autoList);
        setGeneratedPlaylists(generatedList);
        setCounts(countByAutomation(generatedList));
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load playlists."))
      .finally(() => setLoadedFor(username)),
    [username]
  );

  const refetch = useCallback(
    async ({ initial = false } = {}) => {
      if (!username) return;
      if (initial) setLoadedFor(null);
      await load();
    },
    [username, load]
  );

  useEffect(() => {
    if (username) load();
  }, [username, load]);

  if (!username) {
    return { automations: NOTHING, generatedPlaylists: NOTHING, counts: NO_COUNTS, isLoading: false, error: null, playlistsFailed, refetch };
  }

  return { automations, generatedPlaylists, counts, isLoading, error, playlistsFailed, refetch };
}
