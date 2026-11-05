import { useEffect, useRef, useState } from "react";
import { previewAutomation } from "@/lib/api";

const DELAY_MS = 400;

/**
 * Reruns the server preview after each change, one request at a time: a slow query never piles up,
 * and whatever changed meanwhile runs right after it. A null draft means there is nothing to run.
 */
export function useLivePreview(draft) {
  const [state, setState] = useState({ result: null, loading: draft !== null, failed: false });
  const wanted = useRef(null);
  const done = useRef(null);
  const busy = useRef(false);
  const signature = draft && JSON.stringify(draft);

  useEffect(() => {
    wanted.current = signature;
    if (!signature || signature === done.current) return undefined;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      if (busy.current || wanted.current === done.current) return;
      busy.current = true;
      while (wanted.current !== done.current) {
        const sent = wanted.current;
        try {
          const result = await previewAutomation(JSON.parse(sent));
          setState({ result, loading: wanted.current !== sent, failed: false });
        } catch (err) {
          console.error("Preview failed:", err);
          setState((s) => ({ ...s, loading: wanted.current !== sent, failed: true }));
        }
        done.current = sent;
      }
      busy.current = false;
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [signature]);

  return state;
}
