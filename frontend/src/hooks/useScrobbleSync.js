import { useEffect, useState } from "react";
import { getScrobbleSync } from "@/lib/api";

const POLL_MS = 3000;

/** The listening history load status, polled until it finishes or fails. Null until known. */
export function useScrobbleSync(enabled, firstCall = getScrobbleSync) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    let stopped = false;
    const poll = async (load) => {
      try {
        const next = await load();
        if (stopped) return;
        setStatus(next);
        if (!next.complete && next.stage !== "error") timer = setTimeout(() => poll(getScrobbleSync), POLL_MS);
      } catch {
        // An unreadable status stays as it was: the app works without it.
      }
    };
    poll(firstCall);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, firstCall]);

  return status;
}
