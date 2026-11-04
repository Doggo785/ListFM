// SIZE_OK: 326 pure LOC — single page component with cohesive state; splitting would introduce prop drilling for no gain
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "motion/react";
import Loader from "../components/elements/Loader";
import AccountLinkPrompt from "../components/elements/AccountLinkPrompt";
import CountUp from "../components/elements/CountUp";
import TiltedCard, { NewPlaylistCard } from "../components/ui/PlaylistCard";
import { getAutomations, getListeningTotals, getRecentTracks } from "@/lib/api";
import { describeAutomationWithSchedule } from "@/lib/automation-rules";
import { CARD_DEFAULTS, buildAutomationCardBase } from "@/lib/playlist-cards";
import {
  getGreeting,
  getLastVisit,
  formatRelativeTime,
} from "../lib/dashboard-helpers";
import {
  IconHome,
  IconHeadphones,
} from "@tabler/icons-react";
import { extractColors, pickRingColors } from "../lib/color-extract";
import { fadeUp, stagger } from "../lib/animation";

const TOTALS_POLL_MS = 3000;

function StatBlock({ value, label, color, delay = 0 }) {
  return (
    <motion.div variants={fadeUp} className="text-center">
      <div className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color }}>
        <CountUp to={value} duration={2} delay={delay} separator=" " />
      </div>
      <p className="text-xs text-neutral-500 mt-2 uppercase tracking-wider font-medium">
        {label}
      </p>
    </motion.div>
  );
}

function Dashboard() {
  const { user, avatar } = useAuth();
  const username = user?.lastfm_username;
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ringColors, setRingColors] = useState(['var(--ember)', '#c084fc', '#17AEFF']);

  const lastVisit = useMemo(() => getLastVisit(username), [username]);
  const isFirstVisit = lastVisit === null;
  const [automations, setAutomations] = useState([]);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const data = await getAutomations();
        setAutomations(data);
      } catch {
        // Automations silently fail; dashboard still renders without them.
      }
    };
    load();
  }, [username]);

  useEffect(() => {
    if (!username) return undefined;
    let timer;
    let stopped = false;
    const load = async () => {
      try {
        const next = await getListeningTotals();
        if (stopped) return;
        setTotals(next);
        // They grow during the first load, then a page visit is fresh enough.
        if (!next.complete) timer = setTimeout(load, TOTALS_POLL_MS);
      } catch {
        // Totals silently fail; dashboard still renders without them.
      }
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [username]);

  useEffect(() => {
    if (!username) return;
    document.title = `${username} - ListFM`;
  }, [username]);

  useEffect(() => {
    if (!avatar) return;
    let active = true;
    extractColors(avatar).then((palette) => {
      if (active) setRingColors(pickRingColors(palette));
    });
    return () => {
      active = false;
    };
  }, [avatar]);

  useEffect(() => {
    if (!username) return;
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const data = await getRecentTracks(50);
        setPlaylist(data.tracks);
      } catch {
        setError("Failed to fetch data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTracks();
  }, [username]);

  const topArtist = useMemo(() => {
    if (!username || !playlist.length) return null;
    const artistCounts = {};
    playlist.forEach((t) => {
      artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
    });
    const [name, plays] = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
    return { name, plays };
  }, [username, playlist]);

  const automationCards = useMemo(() => {
    if (!username) return [];
    return automations.map((auto) => ({
      ...buildAutomationCardBase(auto),
      description: describeAutomationWithSchedule(auto),
    }));
  }, [username, automations]);

  if (!username) {
    return <AccountLinkPrompt message="Link your Last.fm account to view your dashboard." />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--ground)]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--ground)]">
        <div className="text-center">
          <p className="text-[#FF5900] font-medium">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-[var(--ember)] transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto min-h-screen">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16" data-quiet>
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-14"
        >
          <motion.header variants={fadeUp} className="text-center">
            {avatar && (
              <motion.div
                className="relative inline-block mb-6"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-40 animate-pulse"
                  style={{ background: `linear-gradient(135deg, ${ringColors[0]}, ${ringColors[1]}, ${ringColors[2]})` }}
                />
                <div
                  className="absolute inset-[-3px] rounded-full animate-spin"
                  style={{
                    background: `linear-gradient(135deg, ${ringColors[0]}, ${ringColors[1]}, ${ringColors[2]}, ${ringColors[0]})`,
                    animationDuration: '8s',
                  }}
                />
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[var(--ground)] p-[3px]">
                  <img
                    src={avatar}
                    alt={username}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </motion.div>
            )}
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {getGreeting()}, <span className="text-[#17AEFF]">{username}</span>
            </h1>
            <p className="text-neutral-500 text-sm mt-3">
              {isFirstVisit
                ? "Welcome to ListFM"
                : `Back since ${formatRelativeTime(lastVisit)}`}
            </p>
          </motion.header>

          <motion.div
            variants={stagger}
            className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-4"
          >
            <StatBlock value={totals?.listens ?? 0} label="Listens" color="#ffffff" delay={0} />
            <StatBlock value={totals?.tracks ?? 0} label="Tracks" color="#17AEFF" delay={0.1} />
            <StatBlock value={totals?.artists ?? 0} label="Artists" color="#c084fc" delay={0.2} />
            <StatBlock value={totals?.albums ?? 0} label="Albums" color="var(--ember)" delay={0.3} />
            <StatBlock value={automations.length} label="Automations" color="#22c55e" delay={0.4} />
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          {topArtist && (
            <motion.section variants={fadeUp} className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-2">
                Most played · last 50 plays
              </p>
              <div className="flex items-center justify-center gap-3">
                <IconHeadphones size={18} className="text-[var(--ember)]" strokeWidth={1.5} />
                <span className="text-xl font-bold text-white">{topArtist.name}</span>
                <span className="text-sm text-neutral-500">{topArtist.plays} plays</span>
              </div>
            </motion.section>
          )}

          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          <motion.section variants={fadeUp}>
            <div className="mb-6">
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Your automations
              </h2>
            </div>

            <div className="flex flex-wrap items-start justify-center gap-5">
              {automationCards.map((auto) => {
                const isUserAutomation = !auto.id.startsWith("auto-");
                return (
                  <div
                    key={auto.id}
                    className={`shrink-0 ${isUserAutomation ? "cursor-pointer" : ""}`}
                    onClick={isUserAutomation ? () => navigate(`/playlists/${auto.id}`) : undefined}
                    role={isUserAutomation ? "button" : undefined}
                    tabIndex={isUserAutomation ? 0 : undefined}
                    onKeyDown={
                      isUserAutomation
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/playlists/${auto.id}`);
                            }
                          }
                        : undefined
                    }
                  >
                    <TiltedCard
                      {...CARD_DEFAULTS}
                      imageSrc={auto.image}
                      glowColor={auto.glowColor}
                      altText={auto.title}
                      captionText={auto.title}
                      countdownText={auto.description}
                    />
                  </div>
                );
              })}

              <NewPlaylistCard onClick={() => navigate("/playlists/new")} />
            </div>
          </motion.section>

          <motion.div variants={fadeUp} className="flex justify-center pt-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <IconHome size={16} strokeWidth={1.5} />
              Home
            </button>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}

export default Dashboard;
