import { useCallback, useEffect, useState } from "react";
import { getListeningStory, getListeningTotals, getLatestRuns } from "@/lib/api";

const POLL_MS = 3000;
const MAX_ART_POLLS = 20; // A pass that keeps failing must not keep the page asking.

// The last answers read, per account: coming back to the Dashboard shows them at once and refreshes behind.
let seen = null;
const remember = (username, part) => {
  seen = { ...(seen?.username === username ? seen : {}), username, ...part };
};

/** The Dashboard's data. The story and the totals grow during the first load, and art arrives behind. */
export function useListening(username) {
  const kept = username && seen?.username === username ? seen : null;
  const [story, setStory] = useState(null);
  const [totals, setTotals] = useState(null);
  const [runs, setRuns] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!username) return undefined;
    let timer;
    let stopped = false;
    let artPolls = 0;
    const load = async () => {
      try {
        const [nextStory, nextTotals] = await Promise.all([getListeningStory(), getListeningTotals()]);
        if (stopped) return;
        setStory(nextStory);
        setTotals(nextTotals);
        setFailed(false);
        remember(username, { story: nextStory, totals: nextTotals });
        // Art is only looked up once a first import is done: the reads before do not count toward giving up.
        artPolls = nextStory.covers_pending && nextTotals.complete ? artPolls + 1 : 0;
        if (!nextTotals.complete || (nextStory.covers_pending && artPolls < MAX_ART_POLLS)) timer = setTimeout(load, POLL_MS);
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    load();
    getLatestRuns()
      .then((next) => {
        if (stopped) return;
        setRuns(next);
        remember(username, { runs: next });
      })
      // The poster stands without them: the block then says nothing rather than "Nothing ran yet".
      .catch(() => {});
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [username, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { story: story ?? kept?.story, totals: totals ?? kept?.totals, runs: runs ?? kept?.runs, failed, retry };
}
