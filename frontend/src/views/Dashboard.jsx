import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import Loader from "@/components/elements/Loader";
import { LinkLastfmHint, LoadFailed, StatePage } from "@/components/elements/PageStates";
import Poster from "@/components/dashboard/Poster";
import YearDeck from "@/components/dashboard/YearDeck";
import { useAutomations } from "@/hooks/useAutomations";
import { useListening } from "@/hooks/useListening";

export default function Dashboard() {
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const reducedMotion = useReducedMotion();
  const scroller = useRef(null);
  const line = useRef(null);
  const { story, totals, runs, failed, retry } = useListening(username);
  const { automations, generatedPlaylists } = useAutomations(username);

  useEffect(() => {
    document.title = "Dashboard - ListFM";
  }, []);

  if (!username) {
    return (
      <StatePage>
        <h1 data-quiet className="pb-4 text-4xl">Dashboard</h1>
        <LinkLastfmHint purpose="to see your listening here." />
      </StatePage>
    );
  }
  if (failed && !story) return <StatePage><LoadFailed subject="Your listening" onRetry={retry} /></StatePage>;
  if (!story) return <StatePage><Loader /></StatePage>;

  return (
    <main ref={scroller} className="scroll-edge h-full w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto text-left">
      <Poster story={story} totals={totals} runs={runs} automations={automations} username={username} lineRef={line} reducedMotion={reducedMotion} />
      <YearDeck scrollerRef={scroller} lineRef={line} story={story} automations={automations} playlists={generatedPlaylists} runs={runs} reducedMotion={reducedMotion} />
    </main>
  );
}
