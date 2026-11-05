import { useEffect, useState } from "react";
import { getScrobbleSync } from "@/lib/api";

const POLL_MS = 3000;
// A scheduled sync can start a tag pass at any moment, so an idle status is still re-read now and then.
const IDLE_POLL_MS = 60000;

const isWorking = (status) =>
  status.stage !== "error" && (!status.complete || status.stage === "sync" || status.tags_total > 0);

/** The listening history and tag pass status, polled while the page is open. Null until known. */
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
        timer = setTimeout(() => poll(getScrobbleSync), isWorking(next) ? POLL_MS : IDLE_POLL_MS);
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
