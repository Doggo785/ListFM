import { useCallback, useEffect, useState } from "react";
import { getAutomation, updateAutomation } from "@/lib/api";

export function useAutomation(id) {
  const [automation, setAutomation] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!id) {
      setAutomation(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAutomation(id);
      setAutomation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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
