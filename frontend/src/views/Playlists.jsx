import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import Loader from "../components/elements/Loader";
import { getAutomations } from "@/lib/api";
import {
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  describeCron,
  isValidCron,
} from "@/lib/automation-rules";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

function buildSourceLine(auto) {
  const source = SOURCE_TYPE_LABELS[auto.source?.type] || auto.source?.type || "Unknown source";
  const period =
    PERIOD_OPTIONS.find((p) => p.value === auto.source?.period)?.label ||
    auto.source?.period ||
    "";
  return period ? `${source} · ${period}` : source;
}

function buildSchedule(auto) {
  if (isValidCron(auto.cron)) {
    return describeCron(auto.cron) || auto.cron;
  }
  if (auto.cron) return auto.cron;
  return "No schedule";
}

function formatLastRun(auto) {
  const lastRun = auto.last_run ?? auto.lastRun ?? null;
  if (!lastRun) return "Never run";
  const date = new Date(lastRun);
  if (Number.isNaN(date.getTime())) return String(lastRun);
  return `Last run ${date.toLocaleString()}`;
}

function Playlists() {
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAutomations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAutomations();
      setAutomations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playlists.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!username) return;
    fetchAutomations();
  }, [username, fetchAutomations]);

  if (!username) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <div className="text-center">
          <p className="text-white font-medium mb-2">No Last.fm account linked</p>
          <p className="text-neutral-500 text-sm">Link your Last.fm account to view your playlists.</p>
          <button
            onClick={() => navigate("/link-lastfm")}
            className="mt-4 px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
          >
            Link Last.fm
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <Loader />
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#121212] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
          <motion.header variants={fadeUp} className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Playlists
              </h1>
              <p className="text-neutral-500 text-sm mt-2">
                Your automated playlist generations
              </p>
            </div>
            <button
              onClick={() => navigate("/playlists/new")}
              className="shrink-0 px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
            >
              New playlist
            </button>
          </motion.header>

          {error && (
            <motion.div variants={fadeUp}>
              <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={fetchAutomations}
                  className="mt-3 px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-[#ff530b] transition-colors"
                >
                  Retry
                </button>
              </div>
            </motion.div>
          )}

          {!error && automations.length === 0 && (
            <motion.div variants={fadeUp}>
              <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a] p-8 text-center">
                <p className="text-white font-medium mb-2">No playlists yet</p>
                <p className="text-neutral-500 text-sm mb-4">
                  Create your first automated playlist to get started.
                </p>
                <button
                  onClick={() => navigate("/playlists/new")}
                  className="px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
                >
                  Create a playlist
                </button>
              </div>
            </motion.div>
          )}

          {!error && automations.length > 0 && (
            <motion.ul variants={stagger} className="space-y-3">
              {automations.map((auto) => (
                <motion.li key={auto.id} variants={fadeUp}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/playlists/${auto.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/playlists/${auto.id}`);
                      }
                    }}
                    aria-label={`View ${auto.name || "Untitled"} playlist`}
                    className="w-full text-left rounded-xl border border-neutral-800 bg-[#1a1a1a] p-4 hover:border-neutral-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17AEFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                  >
                    <p className="text-white font-medium">{auto.name || "Untitled"}</p>
                    <p className="text-neutral-500 text-sm mt-1">{buildSourceLine(auto)}</p>
                    <p className="text-neutral-500 text-sm mt-1">{formatLastRun(auto)}</p>
                    <p className="text-neutral-400 text-sm mt-1">{buildSchedule(auto)}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.div>
      </div>
    </main>
  );
}

export default Playlists;
