import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAutomations } from "@/hooks/useAutomations";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import PlaylistCover from "@/components/ui/PlaylistCover";
import Loader from "@/components/elements/Loader";
import { getLatestRuns } from "@/lib/api";
import { describeAutomation, describeSchedule } from "@/lib/automation-rules";
import { plural } from "@/lib/playlists";
import { describeRun } from "@/lib/runs";

const TONES = { plain: "text-(--text)", muted: "text-(--text-muted)", alert: "text-(--ember)" };
const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ember-9)";

export default function Automations() {
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const { automations, generatedPlaylists, counts, isLoading, error, playlistsFailed, refetch } = useAutomations(username);

  // Null until known, or if it fails: the cards then say nothing rather than "No runs yet".
  const [latestRuns, setLatestRuns] = useState(null);

  useEffect(() => {
    document.title = "Automations - ListFM";
  }, []);

  useEffect(() => {
    if (!username) return undefined;
    let current = true;
    getLatestRuns()
      .then((runs) => current && setLatestRuns(runs))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [username]);

  const failing = latestRuns?.some((run) => run.status === "failed");

  return (
    <main data-ribbon-hot={failing ? "" : undefined} className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-8 text-left md:px-8">
      <div className="mx-auto max-w-6xl">
        <header data-quiet className="flex flex-wrap items-end justify-between gap-4 pt-4 pb-8">
          <div>
            <h1 className="text-4xl">Automations</h1>
            <p className="pt-1 text-base text-(--text-muted)">Each one makes playlists from your listens.</p>
          </div>
          <Link to="/automations/new" className={buttonVariants()}>New automation</Link>
        </header>

        {!username && (
          <p data-quiet className="text-base text-(--text-muted)">
            <Link to="/link-lastfm" className={`text-(--ember) underline underline-offset-4 ${FOCUS}`}>Link your Last.fm account</Link> to create automations.
          </p>
        )}
        {username && isLoading && <Loader />}
        {username && !isLoading && error && (
          <div data-quiet role="alert">
            <p className="pb-3 text-base">Your automations could not load.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        )}
        {username && !isLoading && !error && automations.length === 0 && (
          <div data-quiet>
            <p className="text-2xl">No automation yet</p>
            <p className="pt-1 text-base text-(--text-muted)">Create one and it starts making your playlists.</p>
          </div>
        )}
        {!error && automations.length > 0 && (
          <ul data-quiet className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {automations.map((automation) => {
              const latest = generatedPlaylists.find((playlist) => playlist.automation_id === automation.id);
              const lastRun = latestRuns?.find((run) => run.automation_id === automation.id);
              const outcome = lastRun && describeRun(lastRun);
              return (
              <li key={automation.id} className="min-w-0">
                <Link
                  to={`/automations/${automation.id}`}
                  className={`group flex h-full gap-4 border-2 border-(--line) p-3 transition-colors duration-(--duration-quick) hover:border-(--ember) ${FOCUS}`}
                >
                  <PlaylistCover seed={latest?.id ?? automation.id} images={latest?.cover_images} className="size-[128px] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-lg break-words group-hover:text-(--ember)">{automation.name || "Untitled"}</span>
                    <span className="block text-sm text-(--text-muted)">{describeAutomation(automation)}</span>
                    <span className="block text-sm text-(--text-muted)">
                      {automation.enabled === false ? "Paused" : describeSchedule(automation.cron)}
                    </span>
                    {!playlistsFailed && <span className="block text-sm text-(--text-muted)">{plural(counts.get(automation.id) || 0, "playlist")}</span>}
                    {outcome && <span className={`block pt-1 text-sm ${TONES[outcome.tone]}`}>{outcome.label}</span>}
                    {latestRuns && !lastRun && <span className="block pt-1 text-sm text-(--text-muted)">No runs yet</span>}
                  </span>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
