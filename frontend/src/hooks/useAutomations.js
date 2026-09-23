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

export function useAutomations(username) {
  const [automations, setAutomations] = useState([]);
  const [generatedPlaylists, setGeneratedPlaylists] = useState([]);
  const [counts, setCounts] = useState(() => new Map());
  const [isLoading, setIsLoading] = useState(Boolean(username));
  const [error, setError] = useState(null);

  const refetch = useCallback(
    async ({ initial = false } = {}) => {
      if (!username) return;
      if (initial) setIsLoading(true);
      try {
        const [autosResult, generatedResult] = await Promise.allSettled([
          getAutomations(),
          getGeneratedPlaylists(),
        ]);
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
        setAutomations(autoList);
        setGeneratedPlaylists(generatedList);
        setCounts(countByAutomation(generatedList));
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load playlists."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [username]
  );

  useEffect(() => {
    if (!username) {
      setAutomations([]);
      setGeneratedPlaylists([]);
      setCounts(new Map());
      setError(null);
      setIsLoading(false);
      return;
    }
    refetch({ initial: true });
  }, [username, refetch]);

  return { automations, generatedPlaylists, counts, isLoading, error, refetch };
}
