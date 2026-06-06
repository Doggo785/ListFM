import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import Loader from "../components/elements/Loader";
import CountUp from "../components/CountUp";
import TiltedCard from "../components/ui/PlaylistCard";
import { loadAutomationsFromStorage } from "../lib/automation-rules";
import {
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  describeCron,
  isValidCron,
} from "@/lib/automation-rules";
import { getPlaylistImageSrc, GRADIENTS, hashName } from "@/components/ui/PlaylistLogo";
import {
  getGreeting,
  getLastVisit,
  setLastVisit,
  formatRelativeTime,
} from "../lib/dashboard-helpers";
import {
  IconPlaylistAdd,
  IconSearch,
  IconHeadphones,
  IconPlus,
} from "@tabler/icons-react";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

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

function buildDescription(auto) {
  const source = SOURCE_TYPE_LABELS[auto.source?.type] || auto.source?.type;
  const period =
    PERIOD_OPTIONS.find((p) => p.value === auto.source?.period)?.label ||
    auto.source?.period;
  if (isValidCron(auto.cron)) {
    const schedule = describeCron(auto.cron);
    return `${schedule} · ${source} · ${period}`;
  }
  return `${source} · ${period}`;
}

function Dashboard() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const lastVisit = useMemo(() => getLastVisit(username), [username]);
  const isFirstVisit = lastVisit === null;
  const automations = useMemo(() => loadAutomationsFromStorage(), []);

  useEffect(() => {
    setLastVisit(username);
  }, [username]);

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/api/recent-tracks/${username}?limit=50`);
        if (!res.ok) throw new Error("Unable to fetch tracks");
        const data = await res.json();
        setPlaylist(data.tracks);
      } catch (err) {
        setError("Failed to fetch data.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTracks();
  }, [username]);

  const stats = useMemo(() => {
    if (!playlist.length) return { tracks: 0, artists: 0, albums: 0, topArtist: null };
    const artists = new Set();
    const albums = new Set();
    const artistCounts = {};
    playlist.forEach((t) => {
      artists.add(t.artist);
      if (t.album) albums.add(t.album);
      artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
    });
    const sorted = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);
    const topArtist = sorted[0] ? { name: sorted[0][0], plays: sorted[0][1] } : null;
    return { tracks: playlist.length, artists: artists.size, albums: albums.size, topArtist };
  }, [playlist]);

  const automationCards = useMemo(() => {
    return automations.map((auto) => {
      const name = auto.name || "Untitled";
      const [color1] = GRADIENTS[hashName(name) % GRADIENTS.length];
      return {
        id: auto.id,
        title: name,
        image: getPlaylistImageSrc(name, auto.source?.type),
        description: buildDescription(auto),
        glowColor: `radial-gradient(circle, ${color1}55 0%, transparent 70%)`,
      };
    });
  }, [automations]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <div className="text-center">
          <p className="text-[#FF5900] font-medium">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-[#ff530b] transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#121212] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-14"
        >
          {/* Header */}
          <motion.header variants={fadeUp} className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {getGreeting()}, <span className="text-[#17AEFF]">{username}</span>
            </h1>
            <p className="text-neutral-500 text-sm mt-3">
              {isFirstVisit
                ? "Welcome to ListFM"
                : `Back since ${formatRelativeTime(lastVisit)}`}
            </p>
          </motion.header>

          {/* Counters */}
          <motion.div
            variants={stagger}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4"
          >
            <StatBlock value={stats.tracks} label="Tracks" color="#17AEFF" delay={0} />
            <StatBlock value={stats.artists} label="Artists" color="#c084fc" delay={0.1} />
            <StatBlock value={stats.albums} label="Albums" color="#ff530b" delay={0.2} />
            <StatBlock value={automations.length} label="Automations" color="#22c55e" delay={0.3} />
          </motion.div>

          {/* Separator */}
          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          {/* Top Artist */}
          {stats.topArtist && (
            <motion.section variants={fadeUp} className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-2">
                Most played
              </p>
              <div className="flex items-center justify-center gap-3">
                <IconHeadphones size={18} className="text-[#ff530b]" strokeWidth={1.5} />
                <span className="text-xl font-bold text-white">{stats.topArtist.name}</span>
                <span className="text-sm text-neutral-500">{stats.topArtist.plays} plays</span>
              </div>
            </motion.section>
          )}

          {/* Separator */}
          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          {/* Automations Grid */}
          <motion.section variants={fadeUp}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Your automations
              </h2>
              <button
                onClick={() => navigate("/playlists/new")}
                className="flex items-center gap-1.5 text-xs text-[#ff530b] hover:text-[#ff530b]/80 transition-colors font-medium"
              >
                <IconPlaylistAdd size={13} strokeWidth={1.5} />
                New
              </button>
            </div>

            <div className="flex flex-wrap items-start gap-5">
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
                      imageSrc={auto.image}
                      glowColor={auto.glowColor}
                      altText={auto.title}
                      captionText={auto.title}
                      countdownText={auto.description}
                      containerHeight="420px"
                      containerWidth="300px"
                      imageHeight="420px"
                      imageWidth="300px"
                      rotateAmplitude={6}
                      scaleOnHover={1.04}
                      showMobileWarning={false}
                      showTooltip={false}
                      displayOverlayContent
                    />
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => navigate("/playlists/new")}
                className="shrink-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17AEFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                aria-label="Create a new automated playlist"
              >
                <TiltedCard
                  icon={IconPlus}
                  altText="+"
                  captionText="New playlist"
                  countdownText=""
                  containerHeight="420px"
                  containerWidth="300px"
                  imageHeight="420px"
                  imageWidth="300px"
                  rotateAmplitude={6}
                  scaleOnHover={1.04}
                  showMobileWarning={false}
                  showTooltip={false}
                  displayOverlayContent
                />
              </button>
            </div>
          </motion.section>

          {/* Footer */}
          <motion.div variants={fadeUp} className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => navigate("/playlists/new")}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#ff530b] text-white text-sm font-medium rounded-lg hover:bg-[#ff530b]/90 transition-colors shadow-[0_4px_14px_rgba(255,83,11,0.2)]"
            >
              <IconPlaylistAdd size={16} strokeWidth={1.5} />
              New Automation
            </button>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <IconSearch size={16} strokeWidth={1.5} />
              Search
            </button>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}

export default Dashboard;
