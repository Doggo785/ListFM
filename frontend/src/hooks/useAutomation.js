import { useCallback, useEffect, useState } from "react";
import { getAutomation, updateAutomation } from "@/lib/api";

export function useAutomation(id) {
  const [automation, setAutomation] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);

  const load = useCallback(() => getAutomation(id)
    .then(setAutomation)
    .catch((err) => setError(err instanceof Error ? err.message : "Failed to load automation."))
    .finally(() => setIsLoading(false)), [id]);

  const refetch = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    await load();
  }, [id, load]);

  // A new id comes with a new page (App keys pages by path): the first load starts from the initial state.
  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const update = useCallback(
    async (payload) => {
      const data = await updateAutomation(id, payload);
      setAutomation(data);
      return data;
    },
    [id]
  );

  return { automation, isLoading, error, refetch, update };
}
